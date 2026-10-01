/**
 * ThermoCell-AI Frontend API Client
 * Connects React UI to FastAPI backend endpoints with Operator JWT Authentication.
 */

export interface RelaxationTelemetry {
  duration_s: number;
  timestamps: number[];
  voltage: number[];
  bulk_temperature: number[];
}

export interface BatteryPulseTelemetry {
  cell_id: string;
  cycle_index?: number | null;
  provenance: 'REAL' | 'SYNTHETIC' | 'PREDICTED';
  v_pre_pulse: number;
  sampling_rate_hz: number;
  duration_s: number;
  timestamps: number[];
  voltage: number[];
  current: number[];
  bulk_temperature: number[];
  thermal_frames: number[][][]; // 100 frames of 8x8
  relaxation: RelaxationTelemetry;
  metadata?: Record<string, string>;
}

export interface DiagnosticPrediction {
  cell_id: string;
  cycle_index?: number | null;
  provenance: 'PREDICTED';
  triage_class: 'REUSE' | 'RETIRE' | 'INVESTIGATE';
  confidence: number;
  class_probabilities: {
    REUSE: number;
    RETIRE: number;
    INVESTIGATE: number;
  };
  extracted_features: Record<string, number>;
  recommendation: string;
}

export interface DiagnosticRunResponse {
  session_id: string;
  telemetry: BatteryPulseTelemetry;
  prediction: DiagnosticPrediction;
  features: Record<string, number>;
}

export interface SessionSummary {
  session_id: string;
  cell_id: string;
  cycle_index: number | null;
  created_at: string;
  triage_class: 'REUSE' | 'RETIRE' | 'INVESTIGATE';
  confidence: number;
  provenance: 'REAL' | 'SYNTHETIC' | 'PREDICTED';
  v_pre_pulse: number;
}

const API_BASE_URL = 'http://127.0.0.1:8000';
const TOKEN_KEY = 'thermocell_operator_token';

type AuthListener = (auth: boolean) => void;
const authListeners: Set<AuthListener> = new Set();

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    authListeners.forEach((cb) => cb(true));
  } catch (err) {
    console.error('Failed to store auth token:', err);
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    authListeners.forEach((cb) => cb(false));
  } catch (err) {
    console.error('Failed to remove auth token:', err);
  }
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

export function subscribeAuth(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function loginOperator(username: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Authentication failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const token = data.access_token;
  setAuthToken(token);
  return token;
}

export async function simulatePulse(
  profileType: 'nominal' | 'marginal' | 'degraded' = 'nominal',
  cellId: string = 'B0005',
  cycleIndex?: number
): Promise<DiagnosticRunResponse> {
  const response = await fetch(`${API_BASE_URL}/api/simulate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      cell_id: cellId,
      profile_type: profileType,
      cycle_index: cycleIndex,
    }),
  });

  if (response.status === 401) {
    clearAuthToken();
    throw new Error('401 Unauthorized: Operator authentication required.');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Simulation failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function fetchRecentSessions(limit: number = 25): Promise<SessionSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/sessions?limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to load recent sessions: ${response.status}`);
  }
  return response.json();
}

export async function fetchSession(sessionId: string): Promise<DiagnosticRunResponse> {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to load session ${sessionId}`);
  }
  return response.json();
}

export async function fetchCells(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/api/cells`);
  if (!response.ok) {
    throw new Error('Failed to fetch cells catalog');
  }
  return response.json();
}

export async function fetchCellHistory(cellId: string): Promise<SessionSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/cells/${cellId}/history`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to load history for cell ${cellId}`);
  }
  return response.json();
}
