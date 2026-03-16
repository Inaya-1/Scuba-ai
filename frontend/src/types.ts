export type UIMode = 'marine-biologist' | 'diver';
export type AgentType = 'safety' | 'bio' | 'nav' | 'manager';
export type ResponseType = 'info' | 'hazard' | 'species' | 'navigation';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface AgentResponse {
  agent: AgentType;
  type: ResponseType;
  content: string;
  priority: Priority;
  metadata?: Record<string, any>;
}

export interface DiveState {
  depth: number;
  airPressure: number;
  bottomTime: number;
  heading: number;
  waterTemp: number;
  isRecording: boolean;
  isListening: boolean;
}

export interface MapData {
  id: string;
  name: string;
  imageUrl: string;
  description?: string;
}
