package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

@interface LALStatusController : NSObject
- (void)openLAL:(id)sender;
@end

@implementation LALStatusController

- (void)openLAL:(id)sender {
    NSApplication *application = [NSApplication sharedApplication];
    [application activateIgnoringOtherApps:YES];
    [application unhide:nil];

    NSWindow *targetWindow = nil;
    for (NSWindow *window in [application windows]) {
        if ([window.title containsString:@"LAL"]) {
            targetWindow = window;
            break;
        }
    }

    if (targetWindow == nil) {
        for (NSWindow *window in [application windows]) {
            if (window.canBecomeKeyWindow) {
                targetWindow = window;
                break;
            }
        }
    }

    if (targetWindow != nil) {
        [targetWindow makeKeyAndOrderFront:nil];
    }
}

@end

static LALStatusController *lalStatusController = nil;
static NSStatusItem *lalStatusItem = nil;

static void installLALStatusItem(void) {
    if (lalStatusItem != nil) {
        return;
    }

    lalStatusController = [[LALStatusController alloc] init];
    lalStatusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
    lalStatusItem.button.title = @"LAL";
    lalStatusItem.button.target = lalStatusController;
    lalStatusItem.button.action = @selector(openLAL:);
}

*/
import "C"

func installMenuBar() {
	C.installLALStatusItem()
}
