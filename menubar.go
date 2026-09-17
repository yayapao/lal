package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <stdlib.h>
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

static void installLALStatusItem(const unsigned char *iconBytes, int iconLength) {
    if (lalStatusItem != nil) {
        return;
    }

    lalStatusController = [[LALStatusController alloc] init];
    lalStatusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
    if (iconBytes != NULL && iconLength > 0) {
        NSData *iconData = [NSData dataWithBytes:iconBytes length:iconLength];
        NSImage *icon = [[NSImage alloc] initWithData:iconData];
        icon.size = NSMakeSize(18, 18);
        icon.template = YES;
        lalStatusItem.button.image = icon;
        lalStatusItem.button.imagePosition = NSImageOnly;
        [icon release];
    } else {
        lalStatusItem.button.title = @"LAL";
    }
    lalStatusItem.button.target = lalStatusController;
    lalStatusItem.button.action = @selector(openLAL:);
}

*/
import "C"

import (
	_ "embed"
)

//go:embed frontend/src/assets/images/lal-status-icon.png
var lalStatusIcon []byte

func installMenuBar() {
	ptr := C.CBytes(lalStatusIcon)
	defer C.free(ptr)
	C.installLALStatusItem((*C.uchar)(ptr), C.int(len(lalStatusIcon)))
}
