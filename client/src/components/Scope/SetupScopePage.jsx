import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

import { setupScope, getDepartments, getMyScope } from '../../services/facultyScopeApi';
import { ROUTES } from '../../utils/constants';



const SetupScopePage = () => {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Check if we are in "edit" mode
    const queryParams = new URLSearchParams(location.search);
    const isEditMode = queryParams.get('edit') === 'true';

    const [tracks, setTracks] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [availableDepartments, setAvailableDepartments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch available departments
    useEffect(() => {
        const fetchDepts = async () => {
            try {
                const depts = await getDepartments();
                setAvailableDepartments(depts || []);
            } catch (err) {
                console.error("Failed to load departments", err);
                setError("Could not load departments. Please refresh or contact support.");
            }
        };
        fetchDepts();
    }, []);

    // If in edit mode, fetch existing scope
    useEffect(() => {
        if (isEditMode) {
            const fetchScope = async () => {
                try {
                    setLoading(true);
                    const scopeData = await getMyScope();
                    if (scopeData.success && scopeData.data?.scopes) {
                        const uniqueTracks = [...new Set(scopeData.data.scopes.map(s => s.track_name.toLowerCase()))];
                        const uniqueDepts = scopeData.data.scopes
                            .filter(s => s.department_code)
                            .map(s => s.department_code);

                        setTracks(uniqueTracks);
                        setDepartments(uniqueDepts);
                    }
                } catch (err) {
                    console.error("Failed to load existing scope", err);
                    setError("Could not load your existing scope data.");
                } finally {
                    setLoading(false);
                }
            };
            fetchScope();
        }
    }, [isEditMode]);

    // Redirect if scope already exists and NOT in edit mode
    useEffect(() => {
        if (!isEditMode && user?.scopeStatus === 'exists') {
            navigate(ROUTES.DASHBOARD);
        }
    }, [user, navigate, isEditMode]);

    const handleTrackChange = (track) => {
        setTracks(prev => {
            if (prev.includes(track)) return prev.filter(t => t !== track);
            return [...prev, track];
        });
    };

    const handleDepartmentChange = (dept) => {
        setDepartments(prev => {
            if (prev.includes(dept)) return prev.filter(d => d !== dept);
            return [...prev, dept];
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (tracks.length === 0) {
            setError("Please select at least one track.");
            return;
        }

        const needsDept = tracks.includes("core") || tracks.includes("it_core");
        if (needsDept && departments.length === 0) {
            setError("Please select at least one department for CORE/IT tracks.");
            return;
        }

        setLoading(true);
        try {
            await setupScope({ tracks, departments });
            await refreshUser(); // Update context to reflect new scope
            navigate(ROUTES.DASHBOARD); // Redirect to dashboard
        } catch (err) {
            setError(err.error || "Failed to save scope.");
            setLoading(false);
        }
    };

    // Memoize departments grouped by category for performance
    const groupedDepartments = React.useMemo(() => {
        const groups = {};
        availableDepartments.forEach(dept => {
            const cat = dept.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(dept);
        });
        return groups;
    }, [availableDepartments]);

    const handleSelectAll = (categoryDepts) => {
        const deptCodes = categoryDepts.map(d => d.code);
        const allSelected = deptCodes.every(code => departments.includes(code));

        if (allSelected) {
            setDepartments(prev => prev.filter(code => !deptCodes.includes(code)));
        } else {
            setDepartments(prev => [...new Set([...prev, ...deptCodes])]);
        }
    };

    // Styling helpers
    const needsDepartments = tracks.includes('core') || tracks.includes('it_core');

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
                <div>
                    <h2 className="text-center text-3xl font-extrabold text-gray-900">
                        Faculty Evaluation Scope
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Select the tracks and departments you are qualified to evaluate.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}

                <form className="mt-8 space-y-8" onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <label className="block text-sm font-semibold text-gray-700">Evaluation Tracks</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { id: 'core', label: 'CORE', sub: 'Team evaluations (Size 3-4)' },
                                { id: 'it_core', label: 'IT', sub: 'Individual IT-based projects' },
                                { id: 'premium', label: 'PREMIUM', sub: 'High-stakes curated sessions' }
                            ].map((track) => (
                                <div
                                    key={track.id}
                                    onClick={() => handleTrackChange(track.id)}
                                    className={`relative flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${tracks.includes(track.id) ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500 ring-opacity-50' : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-bold text-gray-900">{track.label}</span>
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${tracks.includes(track.id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'}`}>
                                            {tracks.includes(track.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-500">{track.sub}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Department Selection (Conditional) */}
                    {needsDepartments && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="flex justify-between items-center border-b pb-2">
                                <label className="block text-sm font-semibold text-gray-700">
                                    Departments <span className="text-gray-400 font-normal ml-1">(Required for CORE/IT)</span>
                                </label>
                                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">
                                    {departments.length} Selected
                                </span>
                            </div>

                            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {availableDepartments.length === 0 && (
                                    <div className="flex flex-col items-center py-10 text-gray-400">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-2"></div>
                                        <p className="text-sm">Loading available departments...</p>
                                    </div>
                                )}

                                {Object.entries(groupedDepartments).map(([category, depts]) => (
                                    <div key={category} className="space-y-3">
                                        <div className="flex justify-between items-center sticky top-0 bg-white py-1 z-10">
                                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{category}</h4>
                                            <button
                                                type="button"
                                                onClick={() => handleSelectAll(depts)}
                                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase"
                                            >
                                                {depts.every(d => departments.includes(d.code)) ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {depts.map(dept => (
                                                <label
                                                    key={dept.code}
                                                    className={`flex items-center space-x-3 p-3 border rounded-lg transition-all cursor-pointer ${departments.includes(dept.code) ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 hover:bg-gray-50'}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={departments.includes(dept.code)}
                                                        onChange={() => handleDepartmentChange(dept.code)}
                                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium text-gray-800">{dept.code}</span>
                                                        <span className="text-[10px] text-gray-500 truncate max-w-[180px]">{dept.name}</span>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${loading ? 'opacity-75 cursor-not-allowed' : ''}`}
                        >
                            {loading ? (
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : null}
                            {loading ? 'Saving Configuration...' : (isEditMode ? 'Update Evaluation Scope' : 'Confirm Evaluation Scope')}
                        </button>

                        {isEditMode && (
                            <button
                                type="button"
                                onClick={() => navigate(ROUTES.DASHBOARD)}
                                className="mt-4 w-full flex justify-center py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                Cancel & Return to Dashboard
                            </button>
                        )}
                    </div>
                </form>
            </div >
        </div >
    );
};

export default SetupScopePage;
