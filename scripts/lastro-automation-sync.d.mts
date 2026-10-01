export interface AutomationSync {
  request(): boolean;
  reset(): void;
  render(): void;
  onMapReady(): boolean;
}
export function installLastroAutomationSync(tools: object, deps: object): AutomationSync;
export function patchRuntimeAutomationSync(source: string): string;
