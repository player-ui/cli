// Test types for XLR export functionality
export interface WidgetConfig {
  widgetName: string;
  enabled: boolean;
}

export type ConfigMap = Record<string, WidgetConfig>;
