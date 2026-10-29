import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

vi.mock('../wailsjs/go/main/App', () => api);
vi.mock('../wailsjs/runtime/runtime', () => ({EventsOn: vi.fn(() => () => undefined)}));

const wifi = {name: 'en0', label: 'Wi-Fi', up: true, hardware: true, loopback: false,
    ipv4: ['192.168.31.108'], ipv6: ['fe80::1234%en0'], subnetMask: '255.255.255.0', gateway: '192.168.31.1', mac: '12:34:56:78:90:ab', mtu: 1500};
const snapshot = {primaryInterface: 'en0', interfaces: [wifi, {...wifi, name: 'utun0', label: 'utun0', hardware: false, gateway: '', ipv4: []}],
    dns: ['192.168.31.1', '223.5.5.5'], hostname: 'Mac.local', ifconfig: 'en0: flags=8863<UP>\n\tinet 192.168.31.108', warnings: [], checkedAt: '2026-10-29T12:00:00+08:00'};

beforeEach(() => {
    vi.clearAllMocks();
    api.GetAppState.mockResolvedValue({services: [alphaService], workspaces: [], configPath: '', warning: ''});
    api.GetLogs.mockResolvedValue([]);
    api.GetResourceUsage.mockResolvedValue([]);
    api.GetNetworkInfo.mockResolvedValue(snapshot);
    api.CopyNetworkValue.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('network information', () => {
    it('opens independently of services, navigates tabs with a keyboard, and returns', async () => {
        api.GetAppState.mockResolvedValue({services: [], workspaces: [], configPath: '', warning: ''});
        const user = userEvent.setup();
        render(<App/>);
        await user.click(await screen.findByRole('button', {name: '查看网络详情'}));
        const pane = screen.getByRole('region', {name: '网络详情'});
        expect(await within(within(pane).getByRole('tabpanel')).findByText('fe80::1234%en0')).toBeDefined();
        expect(within(pane).queryByText('网络信息')).toBeNull();
        const overview = within(pane).getByRole('tab', {name: '概览'});
        overview.focus();
        await user.keyboard('{ArrowRight}');
        expect(document.activeElement).toBe(within(pane).getByRole('tab', {name: '接口'}));
        expect(within(pane).getByText('utun0', {selector: 'code'})).toBeDefined();
        await user.keyboard('{End}');
        expect(within(pane).getByRole('tab', {name: 'ifconfig'}).getAttribute('aria-selected')).toBe('true');
        expect(within(pane).getByRole('tabpanel').querySelector('pre')?.textContent).toBe(snapshot.ifconfig);
        await user.click(within(pane).getByRole('button', {name: '返回服务'}));
        expect(screen.queryByRole('region', {name: '网络详情'})).toBeNull();
    });

    it('copies exact summary, scoped IPv6 and raw values, with failure feedback', async () => {
        const user = userEvent.setup();
        render(<App/>);
        await screen.findByText(wifi.ipv4[0]);
        await user.click(screen.getByRole('button', {name: '复制局域网 IPv4'}));
        expect(api.CopyNetworkValue).toHaveBeenLastCalledWith(wifi.ipv4[0]);
        expect(await screen.findByText('局域网 IPv4已复制')).toBeDefined();
        await user.click(screen.getByRole('button', {name: '查看网络详情'}));
        await user.click(screen.getByRole('button', {name: '复制IPv6 地址'}));
        expect(api.CopyNetworkValue).toHaveBeenLastCalledWith('fe80::1234%en0');
        await user.click(screen.getByRole('tab', {name: 'ifconfig'}));
        await user.click(screen.getByRole('button', {name: '复制ifconfig 输出'}));
        expect(api.CopyNetworkValue).toHaveBeenLastCalledWith(snapshot.ifconfig);
        api.CopyNetworkValue.mockRejectedValueOnce('剪贴板不可用');
        await user.click(screen.getByRole('button', {name: '复制ifconfig 输出'}));
        expect(await screen.findByText('复制失败：剪贴板不可用')).toBeDefined();
    });

    it('preserves previous data after a failed refresh and clears stale status on recovery', async () => {
        const user = userEvent.setup();
        render(<App/>);
        await user.click(await screen.findByRole('button', {name: '查看网络详情'}));
        await screen.findByText('Mac.local');
        api.GetNetworkInfo.mockRejectedValueOnce('网络读取超时');
        await user.click(screen.getByRole('button', {name: '刷新网络信息'}));
        expect(await screen.findByText(/当前为上次读取的数据/)).toBeDefined();
        expect(screen.getAllByText(wifi.ipv4[0]).length).toBeGreaterThan(0);
        expect(screen.getByText('旧数据')).toBeDefined();
        api.GetNetworkInfo.mockResolvedValueOnce({...snapshot, primaryInterface: '', interfaces: []});
        await user.click(screen.getByRole('button', {name: '刷新网络信息'}));
        expect(await screen.findByText('未检测到局域网连接')).toBeDefined();
        expect(screen.queryByText('旧数据')).toBeNull();
        expect((screen.getByRole('button', {name: '复制局域网 IPv4'}) as HTMLButtonElement).disabled).toBe(true);
    });

    it('keeps service selection and service actions available when showing network details', async () => {
        const user = userEvent.setup();
        render(<App/>);
        const service = await screen.findByRole('img', {name: 'Alpha：Next.js'});
        await user.click(screen.getByRole('button', {name: '查看网络详情'}));
        expect(service.closest('article')?.getAttribute('aria-current')).toBe('true');
        await user.click(service);
        expect(screen.queryByRole('region', {name: '网络详情'})).toBeNull();
        expect(screen.getByRole('button', {name: '启动 Alpha'})).toBeDefined();
        fireEvent.keyDown(window, {key: 'f', metaKey: true});
        expect(document.activeElement).toBe(screen.getByRole('textbox', {name: '搜索服务'}));
    });

    it('refreshes on window focus without issuing overlapping probes', async () => {
        render(<App/>);
        await screen.findByText(wifi.ipv4[0]);
        let complete!: (value: typeof snapshot) => void;
        api.GetNetworkInfo.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
        fireEvent.focus(window);
        fireEvent.focus(window);
        expect(api.GetNetworkInfo).toHaveBeenCalledTimes(2);
        await act(async () => complete(snapshot));
        await waitFor(() => expect(screen.getByRole('button', {name: '查看网络详情'})).toBeDefined());
    });
});
