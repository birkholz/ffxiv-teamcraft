import { inject, provideAppInitializer } from '@angular/core';
import { CraftingReplayService } from './modules/crafting-replay/crafting-replay.service';
import { PacketCaptureTrackerService } from './core/electron/packet-capture-tracker.service';
import { GubalService } from './core/api/gubal.service';
import { RetainersService } from './core/electron/retainers.service';
import { InventoryService } from './modules/inventory/inventory.service';

export const APP_INITIALIZERS = [
  provideAppInitializer(() => {
        const initializerFn = ((craftingReplayService: CraftingReplayService) => {
      return () => {
        craftingReplayService.init();
      };
    })(inject(CraftingReplayService));
        return initializerFn();
      }),
  provideAppInitializer(() => {
        const initializerFn = ((service: PacketCaptureTrackerService) => {
      return () => {
        service.init();
      };
    })(inject(PacketCaptureTrackerService));
        return initializerFn();
      }),
  provideAppInitializer(() => {
        const initializerFn = ((service: GubalService) => {
      return () => {
        setTimeout(() => {
          service.init();
        }, 10000);
      };
    })(inject(GubalService));
        return initializerFn();
      }),
  provideAppInitializer(() => {
        const initializerFn = ((service: RetainersService) => {
      return () => {
        service.init();
      };
    })(inject(RetainersService));
        return initializerFn();
      }),
  provideAppInitializer(() => {
        const initializerFn = ((service: InventoryService) => {
      return () => {
        service.init();
      };
    })(inject(InventoryService));
        return initializerFn();
      })
];
