// The parts of Home Assistant's frontend object and WebSocket API that HomeNodes uses.
// HA does not publish these as a package; they are checked against the fake house in dev/.

/** Raw automation, script or condition config: whatever the user wrote, so deliberately loose. */
export type Config = Record<string, any>;

export interface HassContext {
  id: string;
  parent_id: string | null;
  user_id: string | null;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
  context?: HassContext;
}

export type HassEntities = Record<string, HassEntity>;

export interface EntityRegistryEntry {
  id: string;
  entity_id: string;
  device_id: string | null;
  area_id: string | null;
  disabled_by: string | null;
  hidden_by?: string | null;
  name?: string | null;
  platform?: string;
  labels?: string[];
  categories?: Record<string, string>;
}

export interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  area_id: string | null;
}

export interface AreaRegistryEntry {
  area_id: string;
  name: string;
}

export interface HassEvent<D = Record<string, any>> {
  event_type: string;
  data: D;
  context: HassContext;
  time_fired?: string;
}

export interface StateChangedData {
  entity_id: string;
  old_state: HassEntity | null;
  new_state: HassEntity | null;
}

/** One row of history/history_during_period with minimal_response and no_attributes. */
export interface HistoryRow {
  s: string;
  /** Last updated, epoch seconds. */
  lu: number;
  lc?: number;
  a?: Record<string, any>;
}

export interface LogbookEntry {
  when: number | string;
  entity_id?: string;
  name?: string;
  message?: string;
  source?: string;
  state?: string;
  context_id?: string;
  context_entity_id?: string;
  context_event_type?: string;
}

export interface TraceSummary {
  run_id: string;
  state: string;
  script_execution: string | null;
  trigger?: string | null;
  last_step?: string | null;
  timestamp: { start: string; finish: string | null };
  domain: string;
  item_id: string;
}

export interface TraceStep {
  path: string;
  timestamp: string;
  result?: Record<string, any>;
  error?: string;
  changed_variables?: Record<string, any>;
}

export interface TraceDetail extends TraceSummary {
  trace: Record<string, TraceStep[]>;
  config: Config;
  context: HassContext;
}

export interface RenderTemplateResult {
  result?: unknown;
  listeners?: { all: boolean; entities: string[]; domains: string[]; time: boolean };
  error?: string;
}

export interface Connection {
  sendMessagePromise<T = any>(message: Record<string, any>): Promise<T>;
  subscribeEvents<E = HassEvent>(callback: (event: E) => void, eventType?: string): Promise<() => void>;
  subscribeMessage<R = any>(callback: (result: R) => void, message: Record<string, any>): Promise<() => void>;
}

export interface HomeAssistant {
  states: HassEntities;
  connection: Connection;
  callService(domain: string, service: string, data?: Record<string, any>): Promise<unknown>;
  themes?: { darkMode?: boolean };
  language?: string;
  locale?: { language: string; time_format?: string; time_zone?: string };
  config?: { time_zone?: string };
  user?: { is_admin: boolean };
}
