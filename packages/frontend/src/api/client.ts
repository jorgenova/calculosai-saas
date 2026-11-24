const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

type RequestOptions = {
  method?: string
  body?: unknown
  auth?: boolean
  office?: boolean
  revokeOfficeOnForbidden?: boolean
  responseType?: 'json' | 'blob'
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, office = false, revokeOfficeOnForbidden = true, responseType = 'json' } = options
  const file = body instanceof Blob ? body : null

  const headers: Record<string, string> = {
    'Content-Type': file ? file.type || 'application/octet-stream' : 'application/json',
  }

  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  if (office) {
    const officeId = localStorage.getItem('activeOfficeId')
    if (officeId) headers['X-Office-Id'] = officeId
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: file ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
    if (office && revokeOfficeOnForbidden && response.status === 403) window.dispatchEvent(new Event('office-access-revoked'))
    throw new ApiError(error.error ?? error.message ?? `HTTP ${response.status}`, response.status, error.fields)
  }

  if (responseType === 'blob') return await response.blob() as T
  return response.json() as Promise<T>
}

export const api = {
  get: <T>(path: string, auth = true) =>
    request<T>(path, { method: 'GET', auth }),

  post: <T>(path: string, body: unknown, auth = false) =>
    request<T>(path, { method: 'POST', body, auth }),

  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),

  officeGet: <T>(path: string) =>
    request<T>(path, { method: 'GET', office: true }),

  officePost: <T>(path: string, body: unknown = {}) =>
    request<T>(path, { method: 'POST', body, office: true }),

  officePut: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body, office: true }),

  payroll: <T>(companyId: string, path = '', method = 'GET', body?: unknown) =>
    request<T>('/companies/' + encodeURIComponent(companyId) + '/payroll' + path,
      { method, body, office: true, revokeOfficeOnForbidden: false }),

  payrollFile: (companyId: string, path: string) =>
    request<Blob>('/companies/' + encodeURIComponent(companyId) + '/payroll' + path,
      { office: true, revokeOfficeOnForbidden: false, responseType: 'blob' }),
}

export async function downloadPayrollFile(companyId: string, path: string, filename: string) {
  const file = await api.payrollFile(companyId, path)
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
