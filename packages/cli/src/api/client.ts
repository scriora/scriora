// CLI API Client — thin wrapper around scriora-api HTTP endpoints
// All requests authenticated via Bearer token from config
// Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_CONTRACT_MATRIX.md
import axios from 'axios';
import { config } from '../config/config.js';

export function createApiClient() {
  const baseURL = config.get('apiUrl');
  const token = config.get('accessToken');

  return axios.create({
    baseURL,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    timeout: 30_000,
  });
}
