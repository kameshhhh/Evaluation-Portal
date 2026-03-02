import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { getToken } from './tokenManager';

const API_URL = `${API_BASE_URL}/faculty-scope`;

/**
 * Fetch current faculty scope from the governance system.
 */
export const getMyScope = async () => {
    try {
        const token = getToken();
        const response = await axios.get(`${API_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || { success: false, error: 'Network error' };
    }
};

/**
 * Setup or update the faculty evaluation scope.
 * @param {Object} data - { tracks: string[], departments: string[] }
 */
export const setupScope = async (data) => {
    try {
        const token = getToken();
        const response = await axios.post(`${API_URL}/setup`, data, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || { success: false, error: 'Setup failed' };
    }
};

/**
 * Admin: Fetch all registered faculty scopes.
 */
export const getAllFacultyScopes = async () => {
    try {
        const token = getToken();
        const response = await axios.get(`${API_URL}/admin/all`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || { success: false, error: 'Failed to fetch scopes' };
    }
};

/**
 * Admin: Update a specific faculty scope.
 */
export const updateFacultyScope = async (facultyId, data) => {
    try {
        const token = getToken();
        const response = await axios.put(`${API_URL}/admin/${facultyId}`, data, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || { success: false, error: 'Update failed' };
    }
};

/**
 * Fetch available departments from the canonical static registry.
 */
export const getDepartments = async () => {
    try {
        const token = getToken();
        const response = await axios.get(`${API_URL}/departments`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data.data;
    } catch (error) {
        throw error.response?.data || { success: false, error: 'Failed to fetch departments' };
    }
};
