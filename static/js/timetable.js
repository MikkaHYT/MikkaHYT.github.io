// Timetable JavaScript Functionality

// Study Timer Variables
let studyTimer = null;
let timerDuration = 25 * 60; // 25 minutes in seconds
let originalTimerDuration = 25 * 60; // Store original duration for reset
let timeRemaining = timerDuration;
let isTimerRunning = false;
let sessionsToday = 0;
let totalTimeToday = 0;
let totalTimeAllTime = 0; // All-time study tracking
let isTimerMinimized = false;

// Notes Variables
let notesData = {
    general: '',
    study: '',
    todos: []
};
let currentNoteTab = 'general';
let isNotesPanelOpen = false;

// Color picker variables
let customCellColor = '#ffffff';
let currentEditingCell = null;
let colorLibrary = [];

const COLOR_LIBRARY_ID_PREFIX = 'color-';

function generateColorLibraryId() {
    return `${COLOR_LIBRARY_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

function normalizeColorLibrary(library) {
    if (!Array.isArray(library)) {
        return [];
    }
    const normalized = [];
    const seenIds = new Set();
    library.forEach((item, index) => {
        if (!item || typeof item.value !== 'string') {
            return;
        }
        let value = item.value.trim();
        if (!value.startsWith('#')) {
            value = `#${value}`;
        }
        if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
            return;
        }
        let name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Colour ${normalized.length + 1}`;
        let id = typeof item.id === 'string' && item.id ? item.id : generateColorLibraryId();
        if (seenIds.has(id)) {
            id = generateColorLibraryId();
        }
        seenIds.add(id);
        normalized.push({
            id,
            name,
            value: value.toLowerCase()
        });
    });
    return normalized;
}

function persistColorLibrary(triggerSave = true) {
    timetableData.color_library = colorLibrary.map(color => ({ ...color }));
    if (triggerSave) {
        scheduleAutoSave();
    }
}

let timetableData = {
    id: null,
    name: '',
    row_headers: [],
    column_headers: [],
    cells_data: {},
    color_scheme: {},
    time_slot_mode: true,
    time_slot_settings: {
        start_time: '9:00',
        slot_duration: 60,
        break_duration: 15,
        lunch_break: { start: '12:30', duration: 60 },
        time_format: '24h'
    },
    study_subjects: [],
    theme: 'academic',
    revision_settings: {},
    notes_data: {
        general: '',
        study: '',
        todos: []
    },
    study_time_data: {
        totalTimeAllTime: 0,
        lastSessionDate: null
    },
    color_library: []
};

let saveTimeout = null;
let currentEditCell = null;
let isCustomizePanelOpen = false;
let duplicateMode = false;
let duplicateSourceKey = null;
let duplicateKeyListenerRegistered = false;

// Initialize the timetable
async function initializeTimetable(id) {
    console.log('Initializing timetable with ID:', id);
    try {
        const response = await fetch(`/api/timetable/${id}`);
        console.log('API response status:', response.status);
        if (response.ok) {
            timetableData = await response.json();
            console.log('=== TIMETABLE LOADED FROM SERVER ===');
            console.log('Full loaded data:', timetableData);
            console.log('Loaded color_scheme:', JSON.stringify(timetableData.color_scheme, null, 2));
            console.log('Loaded theme:', timetableData.theme);
            
            // Ensure backwards compatibility
            if (typeof timetableData.time_slot_mode !== 'boolean') {
                timetableData.time_slot_mode = true;
            }
            if (!timetableData.time_slot_settings || typeof timetableData.time_slot_settings !== 'object') {
                timetableData.time_slot_settings = {
                    start_time: '9:00',
                    slot_duration: 60,
                    break_duration: 15,
                    lunch_break: { start: '12:30', duration: 60 },
                    time_format: '24h'
                };
            }
            
            // Ensure we have at least some headers
            if (!timetableData.column_headers || timetableData.column_headers.length === 0) {
                timetableData.column_headers = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                console.log('Added default column headers');
            }
            if (!timetableData.row_headers || timetableData.row_headers.length === 0) {
                timetableData.row_headers = ['9:00 - 10:00', '10:15 - 11:15', '11:30 - 12:30', '13:30 - 14:30', '14:45 - 15:45'];
                console.log('Added default row headers');
            }
            if (!timetableData.cells_data) {
                timetableData.cells_data = {};
                console.log('Initialized empty cells data');
            }
            if (!timetableData.color_scheme) {
                timetableData.color_scheme = {
                    primary: '#3b82f6',
                    secondary: '#64748b',
                    success: '#10b981',
                    warning: '#f59e0b',
                    danger: '#ef4444',
                    background: '#f9fafb',
                    header: '#f3f4f6'
                };
                console.log('Added default color scheme');
            }
            if (!timetableData.study_subjects) {
                timetableData.study_subjects = [];
                console.log('Initialized empty study subjects');
            }
            if (!timetableData.theme) {
                timetableData.theme = 'academic';
                console.log('Set default theme');
            }
            if (!timetableData.revision_settings) {
                timetableData.revision_settings = {};
                console.log('Initialized empty revision settings');
            }
            if (!timetableData.notes_data) {
                timetableData.notes_data = {
                    general: '',
                    study: '',
                    todos: []
                };
                console.log('Initialized empty notes data');
            }
            if (!timetableData.study_time_data) {
                timetableData.study_time_data = {
                    totalTimeAllTime: 0,
                    lastSessionDate: null
                };
                console.log('Initialized empty study time data');
            }
            if (!timetableData.color_library) {
                timetableData.color_library = [];
                console.log('Initialized empty color library');
            }
            colorLibrary = normalizeColorLibrary(timetableData.color_library);
            timetableData.color_library = colorLibrary.map(color => ({ ...color }));
            
            // Load notes and study time data
            notesData = timetableData.notes_data;
            totalTimeAllTime = timetableData.study_time_data.totalTimeAllTime || 0;
            
            // Load the data into UI elements
            loadStudyData();
            loadNotes();
            
            console.log('About to render timetable...');
            renderTimetable();
            
            // Use requestAnimationFrame to ensure DOM is fully ready before applying colors
            requestAnimationFrame(() => {
                setTimeout(() => {
                    console.log('Applying color scheme...');
                    updateColorScheme(false); // Pass false to prevent auto-save during initialization
                    updateTimeSlotUI();
                    updateModalColorButtons(); // Ensure modal colors are updated
                    console.log('Color scheme applied');
                }, 50);
            });
            
            updateSaveStatus('saved');
            console.log('Timetable initialization complete');
        } else {
            throw new Error('Failed to load timetable');
        }
    } catch (error) {
        console.error('Error loading timetable:', error);
        updateSaveStatus('error');
    }
}

// Render the complete timetable
function renderTimetable() {
    console.log('Starting to render timetable...');
    console.log('Column headers:', timetableData.column_headers);
    console.log('Row headers:', timetableData.row_headers);
    
    const table = document.getElementById('timetableGrid');
    if (!table) {
        console.error('Could not find timetableGrid element!');
        return;
    }
    
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');
    
    if (!thead || !tbody) {
        console.error('Could not find thead or tbody elements!');
        return;
    }
    
    // Clear existing content
    thead.innerHTML = '<th class="w-32 h-12 bg-gray-50 border border-gray-200 p-2"><div class="text-xs text-gray-500">Days / Periods</div></th>';
    tbody.innerHTML = '';
    
    // Apply header color to the corner cell
    const cornerCell = thead.querySelector('th');
    if (cornerCell && timetableData.color_scheme.header) {
        cornerCell.style.backgroundColor = timetableData.color_scheme.header;
    }
    
    console.log('Rendering column headers...');
    // Render column headers
    timetableData.column_headers.forEach((header, index) => {
        const th = document.createElement('th');
        th.className = 'timetable-header min-w-32';
        // Apply header color if it exists
        if (timetableData.color_scheme.header) {
            th.style.backgroundColor = timetableData.color_scheme.header;
        }
        th.innerHTML = `<input type="text" class="header-input" value="${header}" onchange="updateColumnHeader(${index}, this.value)" onblur="this.parentElement.classList.remove('editing')" onfocus="this.parentElement.classList.add('editing')">`;
        th.addEventListener('contextmenu', (e) => showHeaderContextMenu(e, 'column', index));
        thead.appendChild(th);
    });
    
    console.log('Rendering rows...');
    // Render rows
    timetableData.row_headers.forEach((rowHeader, rowIndex) => {
        const tr = document.createElement('tr');
        
        // Row header
        const th = document.createElement('th');
        th.className = 'timetable-header';
        // Apply header color if it exists
        if (timetableData.color_scheme.header) {
            th.style.backgroundColor = timetableData.color_scheme.header;
        }
        th.innerHTML = `<input type="text" class="header-input" value="${rowHeader}" onchange="updateRowHeader(${rowIndex}, this.value)" onblur="this.parentElement.classList.remove('editing')" onfocus="this.parentElement.classList.add('editing')">`;
        th.addEventListener('contextmenu', (e) => showHeaderContextMenu(e, 'row', rowIndex));
        tr.appendChild(th);
        
        // Row cells
        timetableData.column_headers.forEach((colHeader, colIndex) => {
            const td = document.createElement('td');
            const cellKey = `${rowIndex}-${colIndex}`;
            const cellData = timetableData.cells_data[cellKey] || { content: '', color: 'default' };
            
            // Set base class
            td.className = `timetable-cell cell-${cellData.color}`;
            
            // Apply custom color if it exists
            if (cellData.color === 'custom' && cellData.customColor) {
                td.style.backgroundColor = cellData.customColor;
                td.className = `timetable-cell cell-custom`;
            }
            
            // Use rich content if available, otherwise use plain content
            const displayContent = cellData.richContent || cellData.content || '';
            const plainContent = cellData.content || '';
            
            // Build display content with time information
            let cellDisplayContent = displayContent || '<span class="text-gray-400">Click to edit...</span>';
            
            // Add time information if available
            if (timetableData.time_slot_mode && cellData.startTime && cellData.endTime) {
                cellDisplayContent = `<div class="cell-time-display">${cellData.startTime} - ${cellData.endTime}</div>${cellDisplayContent}`;
            } else if (timetableData.time_slot_mode && cellData.startTime) {
                cellDisplayContent = `<div class="cell-time-display">${cellData.startTime}</div>${cellDisplayContent}`;
            }
            
            td.dataset.cellKey = cellKey;
            td.innerHTML = `
                <div class="cell-wrapper" data-cell-key="${cellKey}">
                    <div class="cell-content-display" data-cell-key="${cellKey}" title="${duplicateMode ? 'Select a destination cell' : 'Click to edit'}">
                        ${cellDisplayContent}
                    </div>
                    <textarea class="cell-content-hidden" data-cell-key="${cellKey}" style="display: none;" onchange="updateCell('${cellKey}', this.value, '${cellData.color}')">${plainContent}</textarea>
                    <button class="cell-edit-btn" onclick="event.stopPropagation(); openCellEditModal('${cellKey}');" title="Edit cell">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="cell-duplicate-btn" onclick="startDuplicateMode('${cellKey}', event)" title="Duplicate this cell">
                        <i class="fas fa-clone"></i>
                    </button>
                </div>
            `;
            td.addEventListener('contextmenu', (e) => showCellContextMenu(e, cellKey));
            td.addEventListener('click', (event) => handleCellClick(cellKey, event));
            td.addEventListener('mouseenter', () => {
                if (duplicateMode && duplicateSourceKey && cellKey !== duplicateSourceKey) {
                    td.classList.add('duplicate-target-preview');
                }
            });
            td.addEventListener('mouseleave', () => {
                td.classList.remove('duplicate-target-preview');
            });

            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
    
    console.log('Timetable rendering complete!');
    updateDuplicateUI();
}

// Update column header
function updateColumnHeader(index, value) {
    timetableData.column_headers[index] = value;
    scheduleAutoSave();
}

// Update row header
function updateRowHeader(index, value) {
    timetableData.row_headers[index] = value;
    scheduleAutoSave();
}

// Update cell content
function updateCell(cellKey, content, color = 'default') {
    if (!timetableData.cells_data[cellKey]) {
        timetableData.cells_data[cellKey] = {};
    }
    
    // Handle both plain text and rich content
    if (typeof content === 'string' && content.includes('<')) {
        // This is rich HTML content
        timetableData.cells_data[cellKey].content = content.replace(/<[^>]*>/g, ''); // Plain text
        timetableData.cells_data[cellKey].richContent = content; // Rich HTML
    } else {
        // This is plain text
        timetableData.cells_data[cellKey].content = content;
    }
    
    timetableData.cells_data[cellKey].color = color;
    scheduleAutoSave();
}

// Update cell color
function updateCellColor(cellKey, color) {
    if (!timetableData.cells_data[cellKey]) {
        timetableData.cells_data[cellKey] = { content: '', color: color };
    } else {
        timetableData.cells_data[cellKey].color = color;
    }
    
    // Update the cell's appearance
    const cellDisplay = document.querySelector(`.cell-content-display[data-cell-key="${cellKey}"]`);
    const cellTextarea = document.querySelector(`textarea[data-cell-key="${cellKey}"]`);
    
    // Find the cell container (either from display or textarea)
    const cell = cellDisplay ? cellDisplay.closest('.timetable-cell') : cellTextarea?.closest('.timetable-cell');
    
    if (cell) {
        // Remove all color classes
        cell.className = cell.className.replace(/cell-(default|primary|secondary|success|warning|danger|custom)/g, '');
        cell.classList.add(`cell-${color}`);
        
        // Remove any inline background color if switching away from custom
        if (color !== 'custom') {
            cell.style.backgroundColor = '';
        }
    }
    
    scheduleAutoSave();
}

// Start editing a cell
function startCellEdit(textarea) {
    currentEditCell = textarea;
    textarea.parentElement.classList.add('editing');
}

// End editing a cell
function endCellEdit(textarea) {
    textarea.parentElement.classList.remove('editing');
    if (currentEditCell === textarea) {
        currentEditCell = null;
    }
}

// Add new row
function addRow() {
    let newRowName;
    if (timetableData.time_slot_mode) {
        // Generate next time slot
        const lastSlot = timetableData.row_headers[timetableData.row_headers.length - 1];
        newRowName = generateNextTimeSlot(lastSlot);
    } else {
        newRowName = `Time Slot ${timetableData.row_headers.length + 1}`;
    }
    timetableData.row_headers.push(newRowName);
    renderTimetable();
    scheduleAutoSave();
}

// Add new column
function addColumn() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const currentDays = timetableData.column_headers.length;
    const newColName = currentDays < days.length ? days[currentDays] : `Day ${currentDays + 1}`;
    timetableData.column_headers.push(newColName);
    renderTimetable();
    scheduleAutoSave();
}

// Delete row
function deleteRow(index) {
    if (timetableData.row_headers.length <= 1) {
        alert('Cannot delete the last time slot');
        return;
    }
    
    if (confirm('Are you sure you want to delete this time slot?')) {
        timetableData.row_headers.splice(index, 1);
        
        // Update cells data - remove cells from deleted row and shift remaining
        const newCellsData = {};
        Object.keys(timetableData.cells_data).forEach(key => {
            const [rowIndex, colIndex] = key.split('-').map(Number);
            if (rowIndex < index) {
                newCellsData[key] = timetableData.cells_data[key];
            } else if (rowIndex > index) {
                newCellsData[`${rowIndex - 1}-${colIndex}`] = timetableData.cells_data[key];
            }
            // Skip cells from the deleted row
        });
        
        timetableData.cells_data = newCellsData;
        renderTimetable();
        scheduleAutoSave();
    }
}

// Delete column
function deleteColumn(index) {
    if (timetableData.column_headers.length <= 1) {
        alert('Cannot delete the last day');
        return;
    }
    
    if (confirm('Are you sure you want to delete this day?')) {
        timetableData.column_headers.splice(index, 1);
        
        // Update cells data - remove cells from deleted column and shift remaining
        const newCellsData = {};
        Object.keys(timetableData.cells_data).forEach(key => {
            const [rowIndex, colIndex] = key.split('-').map(Number);
            if (colIndex < index) {
                newCellsData[key] = timetableData.cells_data[key];
            } else if (colIndex > index) {
                newCellsData[`${rowIndex}-${colIndex - 1}`] = timetableData.cells_data[key];
            }
            // Skip cells from the deleted column
        });
        
        timetableData.cells_data = newCellsData;
        renderTimetable();
        scheduleAutoSave();
    }
}

// Show context menu for headers
function showHeaderContextMenu(event, type, index) {
    event.preventDefault();
    hideContextMenu();
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    
    const deleteAction = type === 'row' ? `deleteRow(${index})` : `deleteColumn(${index})`;
    const addAction = type === 'row' ? 'addRow()' : 'addColumn()';
    const itemType = type === 'row' ? 'Time Slot' : 'Day';
    
    menu.innerHTML = `
        <button class="context-menu-item" onclick="${addAction}; hideContextMenu();">
            <i class="fas fa-plus mr-2"></i>Add ${itemType}
        </button>
        <button class="context-menu-item danger" onclick="${deleteAction}; hideContextMenu();">
            <i class="fas fa-trash mr-2"></i>Delete ${itemType}
        </button>
    `;
    
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

// Show context menu for cells
function showCellContextMenu(event, cellKey) {
    event.preventDefault();
    hideContextMenu();
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    
    menu.innerHTML = `
        <button class="context-menu-item" onclick="openCellEditModal('${cellKey}'); hideContextMenu();">
            <i class="fas fa-edit mr-2"></i>Edit Cell
        </button>
        <button class="context-menu-item" onclick="clearCell('${cellKey}'); hideContextMenu();">
            <i class="fas fa-eraser mr-2"></i>Clear Cell
        </button>
        <div style="border-top: 1px solid #e5e7eb; margin: 4px 0;"></div>
        <button class="context-menu-item" onclick="updateCellColor('${cellKey}', 'primary'); hideContextMenu();">
            <span class="w-3 h-3 rounded mr-2 inline-block" style="background-color: var(--primary-color);"></span>Primary
        </button>
        <button class="context-menu-item" onclick="updateCellColor('${cellKey}', 'success'); hideContextMenu();">
            <span class="w-3 h-3 rounded mr-2 inline-block" style="background-color: var(--success-color);"></span>Success
        </button>
        <button class="context-menu-item" onclick="updateCellColor('${cellKey}', 'warning'); hideContextMenu();">
            <span class="w-3 h-3 rounded mr-2 inline-block" style="background-color: var(--warning-color);"></span>Warning
        </button>
        <button class="context-menu-item" onclick="updateCellColor('${cellKey}', 'danger'); hideContextMenu();">
            <span class="w-3 h-3 rounded mr-2 inline-block" style="background-color: var(--danger-color);"></span>Danger
        </button>
        <button class="context-menu-item" onclick="updateCellColor('${cellKey}', 'default'); hideContextMenu();">
            <span class="w-3 h-3 rounded mr-2 inline-block border" style="background-color: white;"></span>Default
        </button>
    `;
    
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

// Hide context menu
function hideContextMenu() {
    const menu = document.querySelector('.context-menu');
    if (menu) {
        menu.remove();
    }
}

// Clear cell content
function clearCell(cellKey) {
    updateCell(cellKey, '', 'default');
    
    const cellDisplay = document.querySelector(`.cell-content-display[data-cell-key="${cellKey}"]`);
    const cellTextarea = document.querySelector(`textarea[data-cell-key="${cellKey}"]`);
    const cell = cellDisplay ? cellDisplay.closest('.timetable-cell') : cellTextarea?.closest('.timetable-cell');
    
    if (cellDisplay) {
        cellDisplay.innerHTML = '<span class="text-gray-400">Click to edit...</span>';
    }
    if (cellTextarea) {
        cellTextarea.value = '';
    }
    if (cell) {
        cell.className = cell.className.replace(/cell-(default|primary|secondary|success|warning|danger|custom)/g, '') + ' cell-default';
        cell.style.backgroundColor = '';
    }
}

function startDuplicateMode(cellKey, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (duplicateMode && duplicateSourceKey === cellKey) {
        cancelDuplicateMode();
        return;
    }
    duplicateMode = true;
    duplicateSourceKey = cellKey;
    updateDuplicateUI();
    ensureDuplicateKeyListener();
}

function handleCellClick(cellKey, event) {
    if (event) {
        const button = event.target.closest('button');
        if (button && (button.classList.contains('cell-edit-btn') || button.classList.contains('cell-duplicate-btn'))) {
            return;
        }
    }

    if (duplicateMode) {
        if (cellKey === duplicateSourceKey) {
            return;
        }
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        performCellDuplicate(cellKey);
        return;
    }

    openCellEditModal(cellKey);
}

function performCellDuplicate(targetKey) {
    if (!duplicateSourceKey) {
        return;
    }
    if (targetKey === duplicateSourceKey) {
        return;
    }

    const sourceData = timetableData.cells_data[duplicateSourceKey];
    const targetData = sourceData ? JSON.parse(JSON.stringify(sourceData)) : { content: '', color: 'default' };
    timetableData.cells_data[targetKey] = targetData;
    
    duplicateMode = false;
    const sourceKey = duplicateSourceKey;
    duplicateSourceKey = null;
    unregisterDuplicateKeyListener();
    
    renderTimetable();
    scheduleAutoSave();
    
    requestAnimationFrame(() => flashDuplicatedCell(targetKey));
    console.log(`Duplicated cell data from ${sourceKey} to ${targetKey}`);
}

function cancelDuplicateMode() {
    duplicateMode = false;
    duplicateSourceKey = null;
    unregisterDuplicateKeyListener();
    updateDuplicateUI();
}

function ensureDuplicateKeyListener() {
    if (!duplicateKeyListenerRegistered) {
        document.addEventListener('keydown', handleDuplicateKeydown);
        duplicateKeyListenerRegistered = true;
    }
}

function unregisterDuplicateKeyListener() {
    if (duplicateKeyListenerRegistered) {
        document.removeEventListener('keydown', handleDuplicateKeydown);
        duplicateKeyListenerRegistered = false;
    }
}

function handleDuplicateKeydown(event) {
    if (event.key === 'Escape' && duplicateMode) {
        cancelDuplicateMode();
    }
}

function updateDuplicateUI() {
    const banner = document.getElementById('duplicateModeBanner');
    const statusElement = document.getElementById('duplicateModeStatus');
    const cancelButton = document.getElementById('duplicateCancelButton');

    if (cancelButton && !cancelButton.dataset.listenerAttached) {
        cancelButton.addEventListener('click', (event) => {
            event.preventDefault();
            cancelDuplicateMode();
        });
        cancelButton.dataset.listenerAttached = 'true';
    }

    if (document.body) {
        document.body.classList.toggle('duplicate-mode-active', duplicateMode);
    }

    document.querySelectorAll('.duplicate-source').forEach(el => el.classList.remove('duplicate-source'));
    document.querySelectorAll('.duplicate-target-preview').forEach(el => el.classList.remove('duplicate-target-preview'));

    if (duplicateMode && duplicateSourceKey) {
        const sourceCell = document.querySelector(`td[data-cell-key="${duplicateSourceKey}"]`);
        if (sourceCell) {
            sourceCell.classList.add('duplicate-source');
        }
        if (banner) {
            banner.classList.remove('hidden');
        }
        if (statusElement) {
            statusElement.textContent = `Duplicating from ${getCellLabel(duplicateSourceKey)}. Click a destination cell to copy.`;
        }
    } else {
        if (banner) {
            banner.classList.add('hidden');
        }
        if (statusElement) {
            statusElement.textContent = '';
        }
    }

    document.querySelectorAll('.cell-content-display').forEach(display => {
        const key = display.dataset.cellKey;
        if (duplicateMode && duplicateSourceKey) {
            display.title = key === duplicateSourceKey ? 'Selected for duplication' : 'Click to select as destination';
        } else {
            display.title = 'Click to edit';
        }
    });
}

function getCellLabel(cellKey) {
    const [rowIndex, colIndex] = cellKey.split('-').map(Number);
    const rowLabel = timetableData.row_headers[rowIndex] || `Time Slot ${rowIndex + 1}`;
    const colLabel = timetableData.column_headers[colIndex] || `Day ${colIndex + 1}`;
    return `${colLabel} — ${rowLabel}`;
}

function flashDuplicatedCell(cellKey) {
    const cell = document.querySelector(`td[data-cell-key="${cellKey}"]`);
    if (!cell) {
        return;
    }
    cell.classList.add('duplicate-target-applied');
    setTimeout(() => cell.classList.remove('duplicate-target-applied'), 1200);
}

// Study Timer Functions
function toggleStudyTimer() {
    const panel = document.getElementById('studyTimerPanel');
    const isVisible = !panel.classList.contains('hidden');
    
    if (isVisible) {
        panel.classList.add('hidden');
        document.getElementById('timerText').textContent = 'Start Study';
    } else {
        panel.classList.remove('hidden');
        document.getElementById('timerText').textContent = 'Study Timer';
        if (isCustomizePanelOpen) {
            toggleCustomizePanel(); // Close customize panel if open
        }
        // Re-initialize draggable functionality
        setTimeout(() => initializeDraggableElements(), 100);
    }
}

function startTimer() {
    if (!isTimerRunning) {
        isTimerRunning = true;
        studyTimer = setInterval(() => {
            timeRemaining--;
            updateTimerDisplay();
            
            if (timeRemaining <= 0) {
                completeSession();
            }
        }, 1000);
    }
}

function pauseTimer() {
    if (isTimerRunning) {
        isTimerRunning = false;
        clearInterval(studyTimer);
    }
}

function resetTimer() {
    pauseTimer();
    timerDuration = originalTimerDuration; // Reset to original duration
    timeRemaining = timerDuration;
    updateTimerDisplay();
}

function setTimerDuration(minutes) {
    pauseTimer();
    timerDuration = minutes * 60;
    originalTimerDuration = minutes * 60; // Store the original duration
    timeRemaining = timerDuration;
    updateTimerDisplay();
    
    const sessionType = document.getElementById('sessionType');
    if (minutes === 5) {
        sessionType.textContent = 'Break Time';
    } else {
        sessionType.textContent = 'Focus Session';
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    document.getElementById('timerDisplay').textContent = display;
    
    // Update minimized timer display if it exists
    const minimizedDisplay = document.getElementById('minimizedTimerDisplay');
    if (minimizedDisplay) {
        minimizedDisplay.textContent = display;
    }
}

function completeSession() {
    pauseTimer();
    sessionsToday++;
    totalTimeToday += (timerDuration / 60); // Convert to minutes
    totalTimeAllTime += (timerDuration / 60); // Add to all-time total
    
    // Update progress display
    document.getElementById('sessionsToday').textContent = sessionsToday;
    const todayHours = Math.floor(totalTimeToday / 60);
    const todayMinutes = totalTimeToday % 60;
    document.getElementById('timeToday').textContent = `${todayHours}h ${todayMinutes}m`;
    
    const allTimeHours = Math.floor(totalTimeAllTime / 60);
    const allTimeMinutes = totalTimeAllTime % 60;
    document.getElementById('totalTime').textContent = `${allTimeHours}h ${allTimeMinutes}m`;
    
    // Save study data
    saveStudyData();
    
    // Reset timer
    timerDuration = originalTimerDuration; // Reset to original duration
    timeRemaining = timerDuration;
    updateTimerDisplay();
    
    // Play completion sound
    playCompletionSound();
    
    // Show completion notification
    alert('Session completed! Great work!');
}

// Enhanced Timer Functions
function adjustTimer(minutes) {
    if (!isTimerRunning) {
        // Adjust from current timeRemaining instead of original duration
        const newTimeRemaining = timeRemaining + (minutes * 60);
        if (newTimeRemaining > 0) {
            timeRemaining = newTimeRemaining;
            timerDuration = timeRemaining; // Update timer duration to match
            updateTimerDisplay();
        }
    }
}

function minimizeTimer() {
    document.getElementById('studyTimerPanel').classList.add('hidden');
    document.getElementById('minimizedTimer').classList.remove('hidden');
    isTimerMinimized = true;
    // Re-initialize draggable functionality for minimized timer
    setTimeout(() => initializeDraggableElements(), 100);
}

function maximizeTimer() {
    document.getElementById('studyTimerPanel').classList.remove('hidden');
    document.getElementById('minimizedTimer').classList.add('hidden');
    isTimerMinimized = false;
    // Re-initialize draggable functionality for main panel
    setTimeout(() => initializeDraggableElements(), 100);
}

function playCompletionSound() {
    // Create audio context for timer sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Create a pleasant completion sound
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
    oscillator.frequency.setValueAtTime(1046.5, audioContext.currentTime + 0.1); // C6
    oscillator.frequency.setValueAtTime(1318.5, audioContext.currentTime + 0.2); // E6
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

function saveStudyData() {
    // Save study progress to server
    const studyData = {
        totalTimeAllTime: totalTimeAllTime,
        lastSessionDate: new Date().toDateString()
    };
    
    // Update the timetable data
    timetableData.study_time_data = studyData;
    
    // Save to server
    scheduleAutoSave();
}

function loadStudyData() {
    // Load study progress from timetable data (already loaded during initialization)
    // Update display
    const allTimeHours = Math.floor(totalTimeAllTime / 60);
    const allTimeMinutes = totalTimeAllTime % 60;
    document.getElementById('totalTime').textContent = `${allTimeHours}h ${allTimeMinutes}m`;
}

// Revision Helper Functions
function getDifficultyIcon(difficulty) {
    const icons = {
        'easy': '●',
        'medium': '●●',
        'hard': '●●●'
    };
    return icons[difficulty] || '●●';
}

function getPriorityIcon(priority) {
    const icons = {
        'low': '⬇',
        'normal': '➡',
        'high': '⬆',
        'urgent': '🔥'
    };
    return icons[priority] || '➡';
}

function toggleCellCompletion(cellKey, completed) {
    if (!timetableData.cells_data[cellKey]) {
        timetableData.cells_data[cellKey] = { content: '', color: 'default' };
    }
    
    timetableData.cells_data[cellKey].completed = completed;
    
    // Update visual state
    const textarea = document.querySelector(`textarea[data-cell-key="${cellKey}"]`);
    if (textarea) {
        if (completed) {
            textarea.classList.add('completed');
        } else {
            textarea.classList.remove('completed');
        }
    }
    
    saveData();
}

function cycleDifficulty(cellKey) {
    const difficulties = ['easy', 'medium', 'hard'];
    if (!timetableData.cells_data[cellKey]) {
        timetableData.cells_data[cellKey] = { content: '', color: 'default', difficulty: 'medium' };
    }
    
    const current = timetableData.cells_data[cellKey].difficulty || 'medium';
    const currentIndex = difficulties.indexOf(current);
    const nextIndex = (currentIndex + 1) % difficulties.length;
    const newDifficulty = difficulties[nextIndex];
    
    timetableData.cells_data[cellKey].difficulty = newDifficulty;
    
    // Update visual indicator
    const indicator = document.querySelector(`[onclick*="cycleDifficulty('${cellKey}')"]`);
    if (indicator) {
        indicator.textContent = getDifficultyIcon(newDifficulty);
        indicator.className = `difficulty-indicator difficulty-${newDifficulty}`;
    }
    
    saveData();
}

function cyclePriority(cellKey) {
    const priorities = ['low', 'normal', 'high', 'urgent'];
    if (!timetableData.cells_data[cellKey]) {
        timetableData.cells_data[cellKey] = { content: '', color: 'default', priority: 'normal' };
    }
    
    const current = timetableData.cells_data[cellKey].priority || 'normal';
    const currentIndex = priorities.indexOf(current);
    const nextIndex = (currentIndex + 1) % priorities.length;
    const newPriority = priorities[nextIndex];
    
    timetableData.cells_data[cellKey].priority = newPriority;
    
    // Update visual indicator
    const indicator = document.querySelector(`[onclick*="cyclePriority('${cellKey}')"]`);
    if (indicator) {
        indicator.textContent = getPriorityIcon(newPriority);
        indicator.className = `priority-indicator priority-${newPriority}`;
    }
    
    saveData();
}

// Notes Panel Functions
function toggleNotesPanel() {
    const panel = document.getElementById('notesPanel');
    isNotesPanelOpen = !isNotesPanelOpen;
    
    if (isNotesPanelOpen) {
        panel.classList.remove('hidden');
        loadNotes();
        // Shrink main content to make room
        document.querySelector('.flex-1').style.marginRight = '320px';
        // Re-initialize draggable functionality
        setTimeout(() => initializeDraggableElements(), 100);
    } else {
        panel.classList.add('hidden');
        // Restore main content width
        document.querySelector('.flex-1').style.marginRight = '0';
    }
}

function switchNoteTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.note-tab').forEach(tab => {
        tab.classList.remove('active', 'bg-yellow-300', 'text-yellow-800');
        tab.classList.add('bg-yellow-200', 'text-yellow-700');
    });
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.remove('bg-yellow-200', 'text-yellow-700');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active', 'bg-yellow-300', 'text-yellow-800');
    
    // Update tab content
    document.querySelectorAll('.note-tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    document.getElementById(`${tabName}NotesTab`).classList.remove('hidden');
    currentNoteTab = tabName;
}

function saveNotes() {
    notesData.general = document.getElementById('generalNotes').value;
    notesData.study = document.getElementById('studyNotes').value;
    
    // Update the timetable data
    timetableData.notes_data = notesData;
    
    // Save to server
    scheduleAutoSave();
}

function loadNotes() {
    // Load notes from timetable data (already loaded during initialization)
    document.getElementById('generalNotes').value = notesData.general || '';
    document.getElementById('studyNotes').value = notesData.study || '';
    
    // Load todo items
    renderTodoList();
}

function addTodoItem() {
    const input = document.getElementById('newTodoInput');
    const text = input.value.trim();
    
    if (text) {
        notesData.todos.push({
            id: Date.now(),
            text: text,
            completed: false
        });
        
        input.value = '';
        renderTodoList();
        saveNotes();
    }
}

function handleTodoKeypress(event) {
    if (event.key === 'Enter') {
        addTodoItem();
    }
}

function toggleTodoItem(id) {
    const todo = notesData.todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        renderTodoList();
        saveNotes();
    }
}

function deleteTodoItem(id) {
    notesData.todos = notesData.todos.filter(t => t.id !== id);
    renderTodoList();
    saveNotes();
}

function renderTodoList() {
    const todoList = document.getElementById('todoList');
    todoList.innerHTML = '';
    
    notesData.todos.forEach(todo => {
        const todoItem = document.createElement('div');
        todoItem.className = 'flex items-center space-x-2 p-1 bg-yellow-50 rounded';
        todoItem.innerHTML = `
            <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                   onchange="toggleTodoItem(${todo.id})" 
                   class="text-yellow-600">
            <span class="${todo.completed ? 'line-through text-gray-500' : ''} text-xs flex-1">${todo.text}</span>
            <button onclick="deleteTodoItem(${todo.id})" class="text-red-500 hover:text-red-700 text-xs">
                <i class="fas fa-trash"></i>
            </button>
        `;
        todoList.appendChild(todoItem);
    });
}

// Toggle customize panel
function toggleCustomizePanel() {
    const panel = document.getElementById('customizePanel');
    isCustomizePanelOpen = !isCustomizePanelOpen;
    
    if (isCustomizePanelOpen) {
        panel.classList.remove('hidden');
        panel.classList.add('customize-panel-open');
    } else {
        panel.classList.add('hidden');
        panel.classList.remove('customize-panel-open');
    }
}

// Update color scheme
function updateColorScheme(shouldSave = true) {
    console.log('=== Starting updateColorScheme ===', 'shouldSave:', shouldSave);
    console.log('Current timetableData.color_scheme:', JSON.stringify(timetableData.color_scheme, null, 2));
    
    // Always start by applying the saved color scheme
    const scheme = timetableData.color_scheme;
    console.log('Color scheme data:', scheme);
    
    if (scheme) {
        console.log('Setting CSS variables...');
        document.documentElement.style.setProperty('--primary-color', scheme.primary || '#3b82f6');
        document.documentElement.style.setProperty('--secondary-color', scheme.secondary || '#64748b');
        document.documentElement.style.setProperty('--success-color', scheme.success || '#10b981');
        document.documentElement.style.setProperty('--warning-color', scheme.warning || '#f59e0b');
        document.documentElement.style.setProperty('--danger-color', scheme.danger || '#ef4444');
        
        console.log('CSS variables set:', {
            primary: document.documentElement.style.getPropertyValue('--primary-color'),
            secondary: document.documentElement.style.getPropertyValue('--secondary-color'),
            success: document.documentElement.style.getPropertyValue('--success-color'),
            warning: document.documentElement.style.getPropertyValue('--warning-color'),
            danger: document.documentElement.style.getPropertyValue('--danger-color')
        });
        
        // Create or update dynamic CSS rules to ensure colors are applied
        updateDynamicCSS();
        
        // Apply background color
        if (scheme.background) {
            document.body.style.backgroundColor = scheme.background;
            
            // Adjust text color for dark backgrounds
            const isDark = isColorDark(scheme.background);
            if (isDark) {
                document.body.style.color = '#ffffff';
                document.documentElement.style.setProperty('--text-color', '#ffffff');
                document.documentElement.style.setProperty('--text-secondary', '#d1d5db');
                document.documentElement.style.setProperty('--border-color', '#4b5563');
                
                // Update customize panel for dark theme
                const customizePanel = document.getElementById('customizePanel');
                if (customizePanel) {
                    customizePanel.style.backgroundColor = '#374151';
                    customizePanel.style.color = '#ffffff';
                    customizePanel.style.borderColor = '#4b5563';
                }
            } else {
                document.body.style.color = '#111827';
                document.documentElement.style.setProperty('--text-color', '#111827');
                document.documentElement.style.setProperty('--text-secondary', '#6b7280');
                document.documentElement.style.setProperty('--border-color', '#e5e7eb');
                
                // Update customize panel for light theme
                const customizePanel = document.getElementById('customizePanel');
                if (customizePanel) {
                    customizePanel.style.backgroundColor = '#ffffff';
                    customizePanel.style.color = '#111827';
                    customizePanel.style.borderColor = '#e5e7eb';
                }
            }
        }
        
        // Apply header color
        if (scheme.header) {
            document.documentElement.style.setProperty('--header-color', scheme.header);
            document.querySelectorAll('.timetable-header').forEach(header => {
                header.style.backgroundColor = scheme.header;
            });
        }
    }
    
    // Only check for updates from color inputs during interactive editing (not initialization)
    if (shouldSave) {
        const primaryColor = document.getElementById('primaryColor')?.value;
        const secondaryColor = document.getElementById('secondaryColor')?.value;
        const successColor = document.getElementById('successColor')?.value;
        const warningColor = document.getElementById('warningColor')?.value;
        const dangerColor = document.getElementById('dangerColor')?.value;
        const backgroundColor = document.getElementById('backgroundColor')?.value;
        const headerColor = document.getElementById('headerColor')?.value;
        
        console.log('Checking for color input changes during interactive editing...');
        
        if (primaryColor && primaryColor !== scheme.primary) {
            console.log('Primary color changed from', scheme.primary, 'to', primaryColor);
            timetableData.color_scheme.primary = primaryColor;
            document.documentElement.style.setProperty('--primary-color', primaryColor);
            updateDynamicCSS();
        }
        if (secondaryColor && secondaryColor !== scheme.secondary) {
            console.log('Secondary color changed from', scheme.secondary, 'to', secondaryColor);
            timetableData.color_scheme.secondary = secondaryColor;
            document.documentElement.style.setProperty('--secondary-color', secondaryColor);
            updateDynamicCSS();
        }
        if (successColor && successColor !== scheme.success) {
            console.log('Success color changed from', scheme.success, 'to', successColor);
            timetableData.color_scheme.success = successColor;
            document.documentElement.style.setProperty('--success-color', successColor);
            updateDynamicCSS();
        }
        if (warningColor && warningColor !== scheme.warning) {
            console.log('Warning color changed from', scheme.warning, 'to', warningColor);
            timetableData.color_scheme.warning = warningColor;
            document.documentElement.style.setProperty('--warning-color', warningColor);
            updateDynamicCSS();
        }
        if (dangerColor && dangerColor !== scheme.danger) {
            console.log('Danger color changed from', scheme.danger, 'to', dangerColor);
            timetableData.color_scheme.danger = dangerColor;
            document.documentElement.style.setProperty('--danger-color', dangerColor);
            updateDynamicCSS();
        }
        if (backgroundColor && backgroundColor !== scheme.background) {
            console.log('Background color changed from', scheme.background, 'to', backgroundColor);
            timetableData.color_scheme.background = backgroundColor;
            document.body.style.backgroundColor = backgroundColor;
            
            // Adjust text color for dark backgrounds
            const isDark = isColorDark(backgroundColor);
            if (isDark) {
                document.body.style.color = '#ffffff';
                document.documentElement.style.setProperty('--text-color', '#ffffff');
                document.documentElement.style.setProperty('--text-secondary', '#d1d5db');
                document.documentElement.style.setProperty('--border-color', '#4b5563');
                
                // Update customize panel for dark theme
                const customizePanel = document.getElementById('customizePanel');
                if (customizePanel) {
                    customizePanel.style.backgroundColor = '#374151';
                    customizePanel.style.color = '#ffffff';
                    customizePanel.style.borderColor = '#4b5563';
                }
            } else {
                document.body.style.color = '#111827';
                document.documentElement.style.setProperty('--text-color', '#111827');
                document.documentElement.style.setProperty('--text-secondary', '#6b7280');
                document.documentElement.style.setProperty('--border-color', '#e5e7eb');
                
                // Update customize panel for light theme
                const customizePanel = document.getElementById('customizePanel');
                if (customizePanel) {
                    customizePanel.style.backgroundColor = '#ffffff';
                    customizePanel.style.color = '#111827';
                    customizePanel.style.borderColor = '#e5e7eb';
                }
            }
        }
        if (headerColor && headerColor !== scheme.header) {
            console.log('Header color changed from', scheme.header, 'to', headerColor);
            timetableData.color_scheme.header = headerColor;
            document.documentElement.style.setProperty('--header-color', headerColor);
            // Apply header color to all table headers
            document.querySelectorAll('.timetable-header').forEach(header => {
                header.style.backgroundColor = headerColor;
            });
        }
    }
    
    // Re-apply all saved cell colors to ensure they persist after page refresh
    if (timetableData.cells_data) {
        console.log('Re-applying cell colors...', timetableData.cells_data);
        Object.keys(timetableData.cells_data).forEach(cellKey => {
            const cellData = timetableData.cells_data[cellKey];
            if (cellData && (cellData.color || cellData.customColor)) {
                // Find the cell element using data attribute
                let cellDisplay = document.querySelector(`.cell-content-display[data-cell-key="${cellKey}"]`);
                let cell = cellDisplay ? cellDisplay.closest('.timetable-cell') : null;
                
                // Fallback: try to find by checking all cells
                if (!cell) {
                    const allCells = document.querySelectorAll('.timetable-cell');
                    const [rowIndex, colIndex] = cellKey.split('-').map(Number);
                    if (allCells[rowIndex * timetableData.column_headers.length + colIndex]) {
                        cell = allCells[rowIndex * timetableData.column_headers.length + colIndex];
                    }
                }
                
                if (cell) {
                    // Remove all existing color classes
                    cell.className = cell.className.replace(/cell-(default|primary|secondary|success|warning|danger|custom)/g, '');
                    cell.classList.add('timetable-cell'); // Ensure base class is present
                    
                    if (cellData.color === 'custom' && cellData.customColor) {
                        // Apply custom color
                        cell.style.backgroundColor = cellData.customColor;
                        cell.classList.add('cell-custom');
                        console.log(`Applied custom color ${cellData.customColor} to cell ${cellKey}`);
                    } else if (cellData.color && cellData.color !== 'default') {
                        // Apply preset color class
                        cell.classList.add(`cell-${cellData.color}`);
                        cell.style.backgroundColor = ''; // Clear any inline styles
                        
                        // Force style recalculation by accessing a computed style
                        window.getComputedStyle(cell).backgroundColor;
                        
                        console.log(`Applied preset color ${cellData.color} to cell ${cellKey}`, {
                            className: cell.className,
                            computedColor: window.getComputedStyle(cell).backgroundColor,
                            cssVariable: document.documentElement.style.getPropertyValue(`--${cellData.color}-color`)
                        });
                    } else {
                        // Apply default color
                        cell.classList.add('cell-default');
                        cell.style.backgroundColor = '';
                        console.log(`Applied default color to cell ${cellKey}`);
                    }
                    
                    // Update cell display content with time information
                    if (cellDisplay) {
                        let displayContent = cellData.richContent || cellData.content || '<span class="text-gray-400">Click to edit...</span>';
                        
                        // Add time information if available
                        if (cellData.startTime && cellData.endTime) {
                            displayContent = `<div class="cell-time-display">${cellData.startTime} - ${cellData.endTime}</div>${displayContent}`;
                        } else if (cellData.startTime) {
                            displayContent = `<div class="cell-time-display">${cellData.startTime}</div>${displayContent}`;
                        }
                        
                        cellDisplay.innerHTML = displayContent;
                    }
                    
                    // Force a repaint
                    cell.offsetHeight;
                } else {
                    console.warn(`Could not find cell element for ${cellKey}`);
                }
            }
        });
        
        // Force a final repaint of the entire table
        const table = document.getElementById('timetableGrid');
        if (table) {
            table.offsetHeight;
        }
    }
    
    console.log('=== updateColorScheme completed ===');
    
    // Update customize panel inputs with current values
    updateCustomizePanelInputs();
    
    updateModalColorButtons();
    
    // Only save if this is an interactive color change (not during initialization)
    if (shouldSave) {
        scheduleAutoSave();
    }
}

// Function to update customize panel inputs with current color values
function updateCustomizePanelInputs() {
    const scheme = timetableData.color_scheme;
    
    // Update color input fields with current values
    const backgroundColorInput = document.getElementById('backgroundColor');
    const headerColorInput = document.getElementById('headerColor');
    const primaryColorInput = document.getElementById('primaryColor');
    const secondaryColorInput = document.getElementById('secondaryColor');
    const successColorInput = document.getElementById('successColor');
    const warningColorInput = document.getElementById('warningColor');
    const dangerColorInput = document.getElementById('dangerColor');
    
    if (backgroundColorInput && scheme.background) backgroundColorInput.value = scheme.background;
    if (headerColorInput && scheme.header) headerColorInput.value = scheme.header;
    if (primaryColorInput && scheme.primary) primaryColorInput.value = scheme.primary;
    if (secondaryColorInput && scheme.secondary) secondaryColorInput.value = scheme.secondary;
    if (successColorInput && scheme.success) successColorInput.value = scheme.success;
    if (warningColorInput && scheme.warning) warningColorInput.value = scheme.warning;
    if (dangerColorInput && scheme.danger) dangerColorInput.value = scheme.danger;
    
    console.log('Updated customize panel inputs with current colors:', scheme);
}

// Function to update dynamic CSS rules
function updateDynamicCSS() {
    const scheme = timetableData.color_scheme;
    let dynamicStyleSheet = document.getElementById('dynamic-colors');
    if (!dynamicStyleSheet) {
        dynamicStyleSheet = document.createElement('style');
        dynamicStyleSheet.id = 'dynamic-colors';
        document.head.appendChild(dynamicStyleSheet);
    }
    
    dynamicStyleSheet.textContent = `
        .cell-primary { background-color: ${scheme.primary} !important; color: white !important; }
        .cell-secondary { background-color: ${scheme.secondary} !important; color: white !important; }
        .cell-success { background-color: ${scheme.success} !important; color: white !important; }
        .cell-warning { background-color: ${scheme.warning} !important; color: white !important; }
        .cell-danger { background-color: ${scheme.danger} !important; color: white !important; }
    `;
    
    console.log('Updated dynamic CSS rules:', dynamicStyleSheet.textContent);
}

// Time slot functions
function toggleTimeSlotMode() {
    const checkbox = document.getElementById('timeSlotMode');
    timetableData.time_slot_mode = checkbox.checked;
    
    const settingsDiv = document.getElementById('timeSlotSettings');
    if (timetableData.time_slot_mode) {
        settingsDiv.style.display = 'block';
    } else {
        settingsDiv.style.display = 'none';
    }
    
    scheduleAutoSave();
}

function updateTimeSlotSettings() {
    const startTime = document.getElementById('startTime')?.value;
    const slotDuration = parseInt(document.getElementById('slotDuration')?.value);
    const breakDuration = parseInt(document.getElementById('breakDuration')?.value);
    const lunchBreakStart = document.getElementById('lunchBreakStart')?.value;
    const lunchDuration = parseInt(document.getElementById('lunchDuration')?.value);
    
    if (startTime) timetableData.time_slot_settings.start_time = startTime;
    if (slotDuration) timetableData.time_slot_settings.slot_duration = slotDuration;
    if (breakDuration !== undefined) timetableData.time_slot_settings.break_duration = breakDuration;
    if (lunchBreakStart) timetableData.time_slot_settings.lunch_break.start = lunchBreakStart;
    if (lunchDuration) timetableData.time_slot_settings.lunch_break.duration = lunchDuration;
    
    scheduleAutoSave();
}

function updateTimeSlotUI() {
    const timeSlotModeCheckbox = document.getElementById('timeSlotMode');
    const startTimeInput = document.getElementById('startTime');
    const slotDurationInput = document.getElementById('slotDuration');
    const breakDurationInput = document.getElementById('breakDuration');
    const lunchBreakStartInput = document.getElementById('lunchBreakStart');
    const lunchDurationInput = document.getElementById('lunchDuration');
    const settingsDiv = document.getElementById('timeSlotSettings');
    
    if (timeSlotModeCheckbox) {
        timeSlotModeCheckbox.checked = timetableData.time_slot_mode;
        if (settingsDiv) {
            settingsDiv.style.display = timetableData.time_slot_mode ? 'block' : 'none';
        }
    }
    
    const settings = timetableData.time_slot_settings || {};
    if (startTimeInput && settings.start_time) startTimeInput.value = settings.start_time;
    if (slotDurationInput && settings.slot_duration) slotDurationInput.value = settings.slot_duration;
    if (breakDurationInput && settings.break_duration !== undefined) breakDurationInput.value = settings.break_duration;
    if (lunchBreakStartInput && settings.lunch_break?.start) lunchBreakStartInput.value = settings.lunch_break.start;
    if (lunchDurationInput && settings.lunch_break?.duration) lunchDurationInput.value = settings.lunch_break.duration;
    
    // Update color input fields with saved values
    const scheme = timetableData.color_scheme;
    const backgroundColorInput = document.getElementById('backgroundColor');
    const headerColorInput = document.getElementById('headerColor');
    const primaryColorInput = document.getElementById('primaryColor');
    const secondaryColorInput = document.getElementById('secondaryColor');
    const successColorInput = document.getElementById('successColor');
    const warningColorInput = document.getElementById('warningColor');
    const dangerColorInput = document.getElementById('dangerColor');
    
    if (backgroundColorInput && scheme.background) backgroundColorInput.value = scheme.background;
    if (headerColorInput && scheme.header) headerColorInput.value = scheme.header;
    if (primaryColorInput && scheme.primary) primaryColorInput.value = scheme.primary;
    if (secondaryColorInput && scheme.secondary) secondaryColorInput.value = scheme.secondary;
    if (successColorInput && scheme.success) successColorInput.value = scheme.success;
    if (warningColorInput && scheme.warning) warningColorInput.value = scheme.warning;
    if (dangerColorInput && scheme.danger) dangerColorInput.value = scheme.danger;
}

function generateTimeSlots() {
    const settings = timetableData.time_slot_settings || {};
    const startTime = settings.start_time || '9:00';
    const slotDuration = settings.slot_duration || 60;
    const breakDuration = settings.break_duration || 15;
    const lunchBreakStart = settings.lunch_break?.start || '12:30';
    const lunchDuration = settings.lunch_break?.duration || 60;
    
    const timeSlots = [];
    let currentTime = parseTime(startTime);
    const lunchStart = parseTime(lunchBreakStart);
    const endOfDay = parseTime('17:00'); // Default end time
    
    while (currentTime < endOfDay) {
        const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000);
        
        // Check if this slot would overlap with lunch break
        if (currentTime < lunchStart && slotEnd > lunchStart) {
            // End slot before lunch
            timeSlots.push(`${formatTime(currentTime)} - ${formatTime(lunchStart)}`);
            // Skip to after lunch
            currentTime = new Date(lunchStart.getTime() + lunchDuration * 60000);
        } else {
            timeSlots.push(`${formatTime(currentTime)} - ${formatTime(slotEnd)}`);
            currentTime = new Date(slotEnd.getTime() + breakDuration * 60000);
        }
        
        // Safety check to prevent infinite loops
        if (timeSlots.length > 20) break;
    }
    
    timetableData.row_headers = timeSlots;
    renderTimetable();
    scheduleAutoSave();
}

function generateNextTimeSlot(lastSlot) {
    if (!lastSlot || !lastSlot.includes(' - ')) {
        return '9:00 - 10:00';
    }
    
    const endTime = lastSlot.split(' - ')[1];
    const endTimeObj = parseTime(endTime);
    const settings = timetableData.time_slot_settings;
    const slotDuration = settings.slot_duration || 60;
    const breakDuration = settings.break_duration || 15;
    
    const nextStart = new Date(endTimeObj.getTime() + breakDuration * 60000);
    const nextEnd = new Date(nextStart.getTime() + slotDuration * 60000);
    
    return `${formatTime(nextStart)} - ${formatTime(nextEnd)}`;
}

function parseTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
}

function formatTime(date) {
    return date.toTimeString().slice(0, 5);
}

// Helper function to determine if a color is dark
function isColorDark(hexColor) {
    // Convert hex to RGB
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return true if dark (luminance < 0.5)
    return luminance < 0.5;
}

// Apply preset color schemes
function applyPreset(preset) {
    const presets = {
        default: {
            primary: '#3b82f6',
            secondary: '#64748b',
            success: '#10b981',
            warning: '#f59e0b',
            danger: '#ef4444',
            background: '#f9fafb',
            header: '#f3f4f6'
        },
        ocean: {
            primary: '#0891b2',
            secondary: '#475569',
            success: '#0d9488',
            warning: '#ea580c',
            danger: '#dc2626',
            background: '#f0f9ff',
            header: '#e0f2fe'
        },
        forest: {
            primary: '#059669',
            secondary: '#525252',
            success: '#65a30d',
            warning: '#d97706',
            danger: '#dc2626',
            background: '#f0fdf4',
            header: '#dcfce7'
        },
        sunset: {
            primary: '#ea580c',
            secondary: '#57534e',
            success: '#ca8a04',
            warning: '#dc2626',
            danger: '#be123c',
            background: '#fff7ed',
            header: '#fed7aa'
        },
        pink: {
            primary: '#ec4899',
            secondary: '#f472b6',
            success: '#f9a8d4',
            warning: '#fbbf24',
            danger: '#fb7185',
            background: '#fdf2f8',
            header: '#fce7f3'
        },
        dark: {
            primary: '#60a5fa',
            secondary: '#9ca3af',
            success: '#34d399',
            warning: '#fbbf24',
            danger: '#f87171',
            background: '#111827',
            header: '#374151'
        }
    };
    
    const selectedPreset = presets[preset];
    if (selectedPreset) {
        timetableData.color_scheme = { ...selectedPreset };
        
        // Update color picker inputs first
        document.getElementById('primaryColor').value = selectedPreset.primary;
        document.getElementById('secondaryColor').value = selectedPreset.secondary;
        document.getElementById('successColor').value = selectedPreset.success;
        document.getElementById('warningColor').value = selectedPreset.warning;
        document.getElementById('dangerColor').value = selectedPreset.danger;
        document.getElementById('backgroundColor').value = selectedPreset.background;
        document.getElementById('headerColor').value = selectedPreset.header;
        
        // Then update the color scheme to apply changes
        updateColorScheme();
        
        // Force update dynamic CSS and inputs
        updateDynamicCSS();
        updateCustomizePanelInputs();
        
        scheduleAutoSave();
    }
}

// Update modal color buttons
function updateModalColorButtons() {
    const scheme = timetableData.color_scheme;
    const primaryBtn = document.getElementById('primaryColorBtn');
    const successBtn = document.getElementById('successColorBtn');
    const warningBtn = document.getElementById('warningColorBtn');
    const dangerBtn = document.getElementById('dangerColorBtn');
    
    if (primaryBtn) primaryBtn.style.backgroundColor = scheme.primary || '#3b82f6';
    if (successBtn) successBtn.style.backgroundColor = scheme.success || '#10b981';
    if (warningBtn) warningBtn.style.backgroundColor = scheme.warning || '#f59e0b';
    if (dangerBtn) dangerBtn.style.backgroundColor = scheme.danger || '#ef4444';
}

// Update edit modal color buttons (alias for consistency)
function updateEditModalColors() {
    updateModalColorButtons();
}

// Edit title functionality
function editTitle() {
    const titleElement = document.getElementById('timetableTitle');
    const currentTitle = titleElement.textContent;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'text-xl font-bold text-gray-800 bg-transparent border-b-2 border-blue-500 outline-none';
    
    titleElement.replaceWith(input);
    input.focus();
    input.select();
    
    function saveTitle() {
        const newTitle = input.value.trim() || 'Untitled Timetable';
        timetableData.name = newTitle;
        
        const newTitleElement = document.createElement('h1');
        newTitleElement.id = 'timetableTitle';
        newTitleElement.className = 'text-xl font-bold text-gray-800';
        newTitleElement.textContent = newTitle;
        
        input.replaceWith(newTitleElement);
        scheduleAutoSave();
    }
    
    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveTitle();
        } else if (e.key === 'Escape') {
            const titleElement = document.createElement('h1');
            titleElement.id = 'timetableTitle';
            titleElement.className = 'text-xl font-bold text-gray-800';
            titleElement.textContent = currentTitle;
            input.replaceWith(titleElement);
        }
    });
}

// Schedule auto-save
function scheduleAutoSave() {
    updateSaveStatus('saving');
    
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(async () => {
        try {
            console.log('=== AUTO-SAVE DEBUG ===');
            console.log('Saving color_scheme:', JSON.stringify(timetableData.color_scheme, null, 2));
            console.log('Full timetableData being saved:', {
                name: timetableData.name,
                color_scheme: timetableData.color_scheme,
                theme: timetableData.theme,
                study_subjects: timetableData.study_subjects,
                revision_settings: timetableData.revision_settings
            });
            
            const response = await fetch(`/api/timetable/${timetableData.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: timetableData.name,
                    row_headers: timetableData.row_headers,
                    column_headers: timetableData.column_headers,
                    cells_data: timetableData.cells_data,
                    color_scheme: timetableData.color_scheme,
                    time_slot_mode: timetableData.time_slot_mode,
                    time_slot_settings: timetableData.time_slot_settings,
                    study_subjects: timetableData.study_subjects || [],
                    theme: timetableData.theme || 'academic',
                    revision_settings: timetableData.revision_settings || {},
                    notes_data: timetableData.notes_data || {
                        general: '',
                        study: '',
                        todos: []
                    },
                    study_time_data: timetableData.study_time_data || {
                        totalTimeAllTime: 0,
                        lastSessionDate: null
                    },
                    color_library: timetableData.color_library || []
                })
            });
            
            if (response.ok) {
                console.log('Auto-save successful');
                updateSaveStatus('saved');
            } else {
                console.error('Auto-save failed with status:', response.status);
                const errorText = await response.text();
                console.error('Error response:', errorText);
                throw new Error('Save failed');
            }
        } catch (error) {
            console.error('Auto-save error:', error);
            updateSaveStatus('error');
        }
    }, 1000); // Auto-save after 1 second of inactivity
}

// Update save status indicator
function updateSaveStatus(status) {
    const statusText = document.getElementById('saveStatus');
    const indicator = document.getElementById('saveIndicator');
    
    statusText.className = 'text-sm';
    indicator.className = 'w-2 h-2 rounded-full';
    
    switch (status) {
        case 'saving':
            statusText.textContent = 'Saving...';
            statusText.classList.add('text-yellow-600');
            indicator.classList.add('bg-yellow-500', 'saving');
            break;
        case 'saved':
            statusText.textContent = 'Saved';
            statusText.classList.add('text-green-600');
            indicator.classList.add('bg-green-500', 'saved');
            break;
        case 'error':
            statusText.textContent = 'Error';
            statusText.classList.add('text-red-600');
            indicator.classList.add('bg-red-500', 'error');
            break;
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function(event) {
    // Ctrl+S to manually save
    if (event.ctrlKey && event.key === 's') {
        event.preventDefault();
        scheduleAutoSave();
    }
    
    // Escape to close customize panel
    if (event.key === 'Escape' && isCustomizePanelOpen) {
        toggleCustomizePanel();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set up any additional event listeners or initialization
    updateModalColorButtons();
    initializeDraggableElements();
});

// Modal functions for cell editing
let currentCellBeingEdited = null;
let currentCellColor = 'default';

function openCellEditModal(cellKey) {
    currentCellBeingEdited = cellKey;
    const cellData = timetableData.cells_data[cellKey] || { content: '', color: 'default' };
    
    // Handle custom colors
    if (cellData.color === 'custom' && cellData.customColor) {
        currentCellColor = cellData.customColor;
        const customColorPicker = document.getElementById('customColorPicker');
        if (customColorPicker) {
            customColorPicker.value = cellData.customColor;
        }
    } else {
        currentCellColor = cellData.color;
    }
    
    const editModalTitle = document.getElementById('editModalTitle');
    if (editModalTitle) {
        editModalTitle.textContent = 'Edit Cell';
    }
    
    // Set content in the contenteditable div - use rich content if available
    const editContent = document.getElementById('editModalContent');
    if (editContent) {
        const contentToLoad = cellData.richContent || cellData.content || '';
        editContent.innerHTML = contentToLoad;
    }
    
    // Load time information
    const startTimeInput = document.getElementById('cellStartTime');
    const endTimeInput = document.getElementById('cellEndTime');
    const useCustomTimeCheckbox = document.getElementById('useCustomTime');
    
    if (startTimeInput && endTimeInput && useCustomTimeCheckbox) {
        if (cellData.startTime) {
            startTimeInput.value = cellData.startTime;
            useCustomTimeCheckbox.checked = true;
        } else {
            startTimeInput.value = '';
            useCustomTimeCheckbox.checked = false;
        }
        
        if (cellData.endTime) {
            endTimeInput.value = cellData.endTime;
        } else {
            endTimeInput.value = '';
        }
        
        // Show/hide time inputs based on checkbox
        startTimeInput.style.display = useCustomTimeCheckbox.checked ? 'block' : 'none';
        endTimeInput.style.display = useCustomTimeCheckbox.checked ? 'block' : 'none';
        
        // Add event listener for checkbox
        useCustomTimeCheckbox.onchange = function() {
            startTimeInput.style.display = this.checked ? 'block' : 'none';
            endTimeInput.style.display = this.checked ? 'block' : 'none';
            if (!this.checked) {
                startTimeInput.value = '';
                endTimeInput.value = '';
            }
        };
        
        // Add validation for time inputs
        endTimeInput.onchange = function() {
            if (startTimeInput.value && endTimeInput.value) {
                if (startTimeInput.value >= endTimeInput.value) {
                    alert('End time must be after start time');
                    endTimeInput.value = '';
                }
            }
        };
    }
    
    // Reset formatting controls to default
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');
    if (fontFamily) fontFamily.value = 'Arial';
    if (fontSize) fontSize.value = '12px';
    resetFormattingButtons();
    
    // Update color buttons to show current theme colors
    updateEditModalColors();
    
    const editModal = document.getElementById('editModal');
    if (editModal) {
        editModal.classList.remove('hidden');
    }
    
    // Update color button selection
    updateColorButtonSelection(cellData.color === 'custom' ? 'custom' : cellData.color);
    
    // Focus on content area
    setTimeout(() => {
        if (editContent) {
            editContent.focus();
        }
    }, 100);
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    currentCellBeingEdited = null;
    currentCellColor = 'default';
}

function saveEdit() {
    if (currentCellBeingEdited) {
        const content = document.getElementById('editModalContent').innerHTML;
        
        // Get time information
        const startTimeInput = document.getElementById('cellStartTime');
        const endTimeInput = document.getElementById('cellEndTime');
        const useCustomTimeCheckbox = document.getElementById('useCustomTime');
        
        let startTime = null;
        let endTime = null;
        
        if (useCustomTimeCheckbox && useCustomTimeCheckbox.checked) {
            if (startTimeInput) startTime = startTimeInput.value;
            if (endTimeInput) endTime = endTimeInput.value;
        }
        
        // If custom color is selected, use the hex value directly
        let colorToApply = currentCellColor;
        if (currentCellColor.startsWith('#')) {
            // This is a custom hex color, store it as custom with the value
            updateCellWithCustomColorAndTime(currentCellBeingEdited, content, currentCellColor, startTime, endTime);
        } else {
            // This is a preset color
            updateCellWithTime(currentCellBeingEdited, content, currentCellColor, startTime, endTime);
        }
        
        // Find the cell display and textarea using data attribute
        const cellDisplay = document.querySelector(`.cell-content-display[data-cell-key="${currentCellBeingEdited}"]`);
        const cellTextarea = document.querySelector(`.cell-content-hidden[data-cell-key="${currentCellBeingEdited}"]`);
        
        if (cellDisplay) {
            // Update the display with rich content and time information
            let displayContent = content || '<span class="text-gray-400">Click to edit...</span>';
            
            // Add time information if available
            if (startTime && endTime) {
                displayContent = `<div class="cell-time-display">${startTime} - ${endTime}</div>${displayContent}`;
            } else if (startTime) {
                displayContent = `<div class="cell-time-display">${startTime}</div>${displayContent}`;
            }
            
            cellDisplay.innerHTML = displayContent;
        }
        
        if (cellTextarea) {
            // Update the hidden textarea with plain text for compatibility
            cellTextarea.value = content.replace(/<[^>]*>/g, '');
        }
        
        // Apply color to the cell
        const cell = cellDisplay ? cellDisplay.closest('.timetable-cell') : cellTextarea?.closest('.timetable-cell');
        if (cell) {
            if (currentCellColor.startsWith('#')) {
                // Apply custom color directly
                cell.style.backgroundColor = currentCellColor;
                cell.className = cell.className.replace(/cell-(default|primary|secondary|success|warning|danger|custom)/g, '') + ' cell-custom';
            } else {
                // Apply preset color class
                cell.className = cell.className.replace(/cell-(default|primary|secondary|success|warning|danger|custom)/g, '') + ` cell-${currentCellColor}`;
                cell.style.backgroundColor = ''; // Clear any inline styles
            }
        }
    }
    closeEditModal();
}

// New function to handle custom colors
function updateCellWithCustomColor(cellKey, content, customColor) {
    if (!timetableData.cells_data[cellKey]) {
        timetableData.cells_data[cellKey] = {};
    }
    timetableData.cells_data[cellKey].content = content.replace(/<[^>]*>/g, ''); // Plain text for compatibility
    timetableData.cells_data[cellKey].richContent = content; // Rich HTML content
    timetableData.cells_data[cellKey].color = 'custom';
    timetableData.cells_data[cellKey].customColor = customColor;
    scheduleAutoSave();
}

// New function to update cell with time information
function updateCellWithTime(cellKey, content, color, startTime, endTime) {
    if (!timetableData.cells_data[cellKey]) {
        timetableData.cells_data[cellKey] = {};
    }
    timetableData.cells_data[cellKey].content = content.replace(/<[^>]*>/g, ''); // Plain text for compatibility
    timetableData.cells_data[cellKey].richContent = content; // Rich HTML content
    timetableData.cells_data[cellKey].color = color;
    
    // Handle time information
    if (startTime) {
        timetableData.cells_data[cellKey].startTime = startTime;
    } else {
        delete timetableData.cells_data[cellKey].startTime;
    }
    
    if (endTime) {
        timetableData.cells_data[cellKey].endTime = endTime;
    } else {
        delete timetableData.cells_data[cellKey].endTime;
    }
    
    scheduleAutoSave();
}

// New function to update cell with custom color and time information
function updateCellWithCustomColorAndTime(cellKey, content, customColor, startTime, endTime) {
    if (!timetableData.cells_data[cellKey]) {
        timetableData.cells_data[cellKey] = {};
    }
    timetableData.cells_data[cellKey].content = content.replace(/<[^>]*>/g, ''); // Plain text for compatibility
    timetableData.cells_data[cellKey].richContent = content; // Rich HTML content
    timetableData.cells_data[cellKey].color = 'custom';
    timetableData.cells_data[cellKey].customColor = customColor;
    
    // Handle time information
    if (startTime) {
        timetableData.cells_data[cellKey].startTime = startTime;
    } else {
        delete timetableData.cells_data[cellKey].startTime;
    }
    
    if (endTime) {
        timetableData.cells_data[cellKey].endTime = endTime;
    } else {
        delete timetableData.cells_data[cellKey].endTime;
    }
    
    scheduleAutoSave();
}

function setCellColor(color) {
    if (color === 'custom') {
        const customColorInput = document.getElementById('customColorPicker');
        const pickerValue = customColorInput.value || '#ffffff';
        currentCellColor = pickerValue.toLowerCase();
        customCellColor = pickerValue.toLowerCase();
        const libraryValueInput = document.getElementById('libraryColorValue');
        if (libraryValueInput) {
            libraryValueInput.value = pickerValue;
        }
        const modal = document.getElementById('colorLibraryModal');
        if (modal && !modal.classList.contains('hidden')) {
            renderColorLibrary();
        }
    } else {
        currentCellColor = color;
    }
    updateColorButtonSelection(color);
}

function setCustomCellColor(colorValue) {
    if (!colorValue) {
        return;
    }
    const normalizedValue = colorValue.toLowerCase();
    customCellColor = normalizedValue;
    // Automatically select custom when the color picker changes
    currentCellColor = normalizedValue;
    const libraryValueInput = document.getElementById('libraryColorValue');
    if (libraryValueInput) {
        libraryValueInput.value = normalizedValue;
    }
    updateColorButtonSelection('custom');
    const modal = document.getElementById('colorLibraryModal');
    if (modal && !modal.classList.contains('hidden')) {
        renderColorLibrary();
    }
}

function openColorLibrary() {
    const modal = document.getElementById('colorLibraryModal');
    if (!modal) {
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (!modal.dataset.bound) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeColorLibrary();
            }
        });
        modal.dataset.bound = 'true';
    }
    const nameInput = document.getElementById('libraryColorName');
    if (nameInput) {
        nameInput.value = '';
    }
    const valueInput = document.getElementById('libraryColorValue');
    if (valueInput) {
        const customColorInput = document.getElementById('customColorPicker');
        const fallback = customCellColor || '#ffffff';
        valueInput.value = (customColorInput && customColorInput.value) ? customColorInput.value : fallback;
    }
    renderColorLibrary();
}

function closeColorLibrary() {
    const modal = document.getElementById('colorLibraryModal');
    if (!modal) {
        return;
    }
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function renderColorLibrary() {
    const list = document.getElementById('colorLibraryList');
    if (!list) {
        return;
    }
    list.innerHTML = '';
    if (!colorLibrary || colorLibrary.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'p-4 text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded';
        emptyState.innerHTML = '<p class="font-medium text-gray-600 mb-1">No saved colours yet</p><p class="text-xs text-gray-500">Save a colour using the form above to reuse it later.</p>';
        list.appendChild(emptyState);
        return;
    }
    const activeColor = (customCellColor || '').toLowerCase();
    colorLibrary.forEach(color => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 bg-white border border-gray-200 rounded hover:border-blue-400 transition-colors';
        if (color.value === activeColor) {
            item.classList.add('ring-2', 'ring-blue-200');
        }
        const infoWrapper = document.createElement('div');
        infoWrapper.className = 'flex items-center space-x-3';
        const swatch = document.createElement('div');
        swatch.className = 'w-10 h-10 rounded border border-gray-300 shadow-inner';
        swatch.style.backgroundColor = color.value;
        const textWrapper = document.createElement('div');
        const nameElem = document.createElement('p');
        nameElem.className = 'text-sm font-medium text-gray-700';
        nameElem.textContent = color.name;
        const valueElem = document.createElement('p');
        valueElem.className = 'text-xs text-gray-500 uppercase';
        valueElem.textContent = color.value;
        textWrapper.appendChild(nameElem);
        textWrapper.appendChild(valueElem);
        infoWrapper.appendChild(swatch);
        infoWrapper.appendChild(textWrapper);
        item.appendChild(infoWrapper);
        const actions = document.createElement('div');
        actions.className = 'flex items-center space-x-2';
        const applyBtn = document.createElement('button');
        applyBtn.className = 'px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', () => applyColorFromLibrary(color.id));
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'p-2 text-gray-400 hover:text-red-500';
        deleteBtn.setAttribute('title', 'Delete colour');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.addEventListener('click', () => deleteColorFromLibrary(color.id));
        actions.appendChild(applyBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(actions);
        list.appendChild(item);
    });
}

function saveColorToLibrary() {
    const valueInput = document.getElementById('libraryColorValue');
    if (!valueInput) {
        return;
    }
    let colorValue = valueInput.value;
    if (!colorValue || !/^#[0-9a-fA-F]{6}$/.test(colorValue)) {
        alert('Please choose a valid colour to save.');
        return;
    }
    colorValue = colorValue.toLowerCase();
    const nameInput = document.getElementById('libraryColorName');
    const colorName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : `Colour ${colorLibrary.length + 1}`;

    const duplicate = colorLibrary.find(color => color.value === colorValue && color.name.toLowerCase() === colorName.toLowerCase());
    if (duplicate) {
        alert('This colour is already saved with the same name.');
        return;
    }

    const newEntry = {
        id: generateColorLibraryId(),
        name: colorName,
        value: colorValue
    };
    colorLibrary.push(newEntry);
    persistColorLibrary();
    renderColorLibrary();
    if (nameInput) {
        nameInput.value = '';
    }
}

function applyColorFromLibrary(colorId) {
    const colorEntry = colorLibrary.find(color => color.id === colorId);
    if (!colorEntry) {
        return;
    }
    const customColorInput = document.getElementById('customColorPicker');
    if (customColorInput) {
        customColorInput.value = colorEntry.value;
    }
    setCustomCellColor(colorEntry.value);
    renderColorLibrary();
}

function deleteColorFromLibrary(colorId) {
    const initialLength = colorLibrary.length;
    colorLibrary = colorLibrary.filter(color => color.id !== colorId);
    if (colorLibrary.length !== initialLength) {
        persistColorLibrary();
        renderColorLibrary();
    }
}

function updateColorButtonSelection(selectedColor) {
    // Remove selection from all buttons
    document.querySelectorAll('#editModal button[onclick*="setCellColor"]').forEach(btn => {
        btn.classList.remove('ring-2', 'ring-blue-500');
    });
    
    // Add selection to current color
    const colorMap = {
        'default': 'button[onclick="setCellColor(\'default\')"]',
        'primary': 'button[onclick="setCellColor(\'primary\')"]',
        'success': 'button[onclick="setCellColor(\'success\')"]',
        'warning': 'button[onclick="setCellColor(\'warning\')"]',
        'danger': 'button[onclick="setCellColor(\'danger\')"]',
        'custom': 'button[onclick="setCellColor(\'custom\')"]'
    };
    
    if (colorMap[selectedColor]) {
        const button = document.querySelector(colorMap[selectedColor]);
        if (button) {
            button.classList.add('ring-2', 'ring-blue-500');
        }
    }
}

// Initialize enhanced features when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Notes and study data are now loaded during timetable initialization
    // loadStudyData();
    // loadNotes();
});

// Formatting helper to ensure we always have a selection when applying styles
function ensureSelectionForFormatting(editContent) {
    const selection = window.getSelection();
    let autoSelected = false;
    
    if (!selection || !editContent) {
        return { selection: null, autoSelected };
    }
    
    const hasRange = selection.rangeCount > 0;
    const hasContentSelected = hasRange && selection.toString().length > 0;
    
    if (!hasRange || !hasContentSelected || selection.isCollapsed) {
        const range = document.createRange();
        range.selectNodeContents(editContent);
        selection.removeAllRanges();
        selection.addRange(range);
        autoSelected = true;
    }
    
    return { selection, autoSelected };
}

// Formatting functions for edit modal
function applyFormatting(command, value = null) {
    const editContent = document.getElementById('editModalContent');
    if (!editContent) {
        return;
    }
    
    editContent.focus();
    let selectionInfo = { selection: null, autoSelected: false };
    
    if (command === 'fontFamily') {
        selectionInfo = ensureSelectionForFormatting(editContent);
        document.execCommand('fontName', false, value);
    } else if (command === 'fontSize') {
        selectionInfo = ensureSelectionForFormatting(editContent);
        const { selection, autoSelected } = selectionInfo;
        
        if (selection && selection.rangeCount > 0) {
            if (autoSelected) {
                // Apply to the entire content area
                editContent.style.fontSize = value;
            } else {
                const range = selection.getRangeAt(0);
                const span = document.createElement('span');
                span.style.fontSize = value;
                
                try {
                    const contents = range.extractContents();
                    span.appendChild(contents);
                    range.insertNode(span);
                } catch (e) {
                    console.error('Error applying font size:', e);
                    editContent.style.fontSize = value;
                }
            }
        }
    } else if (command === 'color') {
        selectionInfo = ensureSelectionForFormatting(editContent);
        document.execCommand('foreColor', false, value);
    } else {
        selectionInfo = ensureSelectionForFormatting(editContent);
        // For bold, italic, underline, strikethrough
        document.execCommand(command, false, null);
        updateFormattingButtons();
    }
    
    if (selectionInfo.autoSelected && selectionInfo.selection) {
        selectionInfo.selection.removeAllRanges();
    }
    
    editContent.focus();
}

function updateFormattingButtons() {
    const commands = ['bold', 'italic', 'underline', 'strikeThrough'];
    const buttons = ['boldBtn', 'italicBtn', 'underlineBtn', 'strikeBtn'];
    
    commands.forEach((command, index) => {
        const button = document.getElementById(buttons[index]);
        if (button) {
            try {
                if (document.queryCommandState(command)) {
                    button.classList.add('bg-gray-200');
                } else {
                    button.classList.remove('bg-gray-200');
                }
            } catch (e) {
                // Fallback if queryCommandState fails
                button.classList.remove('bg-gray-200');
            }
        }
    });
}

function resetFormattingButtons() {
    const buttons = ['boldBtn', 'italicBtn', 'underlineBtn', 'strikeBtn'];
    buttons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.classList.remove('bg-gray-200');
        }
    });
}

// Handle selection change in edit modal to update formatting buttons
document.addEventListener('selectionchange', function() {
    const activeElement = document.activeElement;
    if (activeElement && activeElement.id === 'editModalContent') {
        updateFormattingButtons();
    }
});

// Draggable and Resizable Functionality
let dragState = {
    isDragging: false,
    isResizing: false,
    currentElement: null,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    startWidth: 0,
    startHeight: 0
};

// Make an element draggable
function makeDraggable(element, handle = null) {
    const dragHandle = handle || element;
    
    dragHandle.style.cursor = 'move';
    dragHandle.addEventListener('mousedown', initDrag);
    dragHandle.addEventListener('touchstart', initDrag, { passive: false });
    
    function initDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Don't drag if clicking on buttons, inputs, or textareas
        if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            return;
        }
        
        dragState.isDragging = true;
        dragState.currentElement = element;
        
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        
        dragState.startX = clientX;
        dragState.startY = clientY;
        
        const rect = element.getBoundingClientRect();
        dragState.startLeft = rect.left;
        dragState.startTop = rect.top;
        
        // Set element position to absolute if it isn't already
        if (getComputedStyle(element).position !== 'absolute') {
            element.style.position = 'fixed';
            element.style.left = rect.left + 'px';
            element.style.top = rect.top + 'px';
        }
        
        element.style.zIndex = '1000';
        element.classList.add('dragging');
        
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', stopDrag);
    }
    
    function drag(e) {
        if (!dragState.isDragging) return;
        
        e.preventDefault();
        
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        
        const deltaX = clientX - dragState.startX;
        const deltaY = clientY - dragState.startY;
        
        const newLeft = dragState.startLeft + deltaX;
        const newTop = dragState.startTop + deltaY;
        
        // Keep element within viewport bounds
        const maxLeft = window.innerWidth - element.offsetWidth;
        const maxTop = window.innerHeight - element.offsetHeight;
        
        element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
        element.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
    }
    
    function stopDrag() {
        if (!dragState.isDragging) return;
        
        dragState.isDragging = false;
        dragState.currentElement = null;
        
        element.classList.remove('dragging');
        element.style.zIndex = '';
        
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', drag);
        document.removeEventListener('touchend', stopDrag);
    }
}

// Make an element resizable
function makeResizable(element) {
    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
    element.appendChild(resizeHandle);
    
    resizeHandle.addEventListener('mousedown', initResize);
    resizeHandle.addEventListener('touchstart', initResize, { passive: false });
    
    function initResize(e) {
        e.preventDefault();
        e.stopPropagation();
        
        dragState.isResizing = true;
        dragState.currentElement = element;
        
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        
        dragState.startX = clientX;
        dragState.startY = clientY;
        
        const rect = element.getBoundingClientRect();
        dragState.startWidth = rect.width;
        dragState.startHeight = rect.height;
        
        element.style.minWidth = '200px';
        element.style.minHeight = '150px';
        
        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);
        document.addEventListener('touchmove', resize, { passive: false });
        document.addEventListener('touchend', stopResize);
    }
    
    function resize(e) {
        if (!dragState.isResizing) return;
        
        e.preventDefault();
        
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        
        const deltaX = clientX - dragState.startX;
        const deltaY = clientY - dragState.startY;
        
        const newWidth = Math.max(200, dragState.startWidth + deltaX);
        const newHeight = Math.max(150, dragState.startHeight + deltaY);
        
        element.style.width = newWidth + 'px';
        element.style.height = newHeight + 'px';
    }
    
    function stopResize() {
        if (!dragState.isResizing) return;
        
        dragState.isResizing = false;
        dragState.currentElement = null;
        
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', resize);
        document.removeEventListener('touchend', stopResize);
    }
}

// Initialize draggable elements when DOM is loaded
function initializeDraggableElements() {
    // Make study timer panel draggable by its header
    const studyTimerPanel = document.getElementById('studyTimerPanel');
    if (studyTimerPanel && !studyTimerPanel.hasAttribute('data-draggable-initialized')) {
        const header = studyTimerPanel.querySelector('.flex.items-center.justify-between');
        if (header) {
            makeDraggable(studyTimerPanel, header);
            makeResizable(studyTimerPanel);
            studyTimerPanel.setAttribute('data-draggable-initialized', 'true');
        }
    }
    
    // Make minimized timer draggable
    const minimizedTimer = document.getElementById('minimizedTimer');
    if (minimizedTimer && !minimizedTimer.hasAttribute('data-draggable-initialized')) {
        makeDraggable(minimizedTimer);
        minimizedTimer.setAttribute('data-draggable-initialized', 'true');
    }
    
    // Make notes panel draggable by its header and resizable
    const notesPanel = document.getElementById('notesPanel');
    if (notesPanel && !notesPanel.hasAttribute('data-draggable-initialized')) {
        const header = notesPanel.querySelector('.bg-yellow-200');
        if (header) {
            makeDraggable(notesPanel, header);
            makeResizable(notesPanel);
            notesPanel.setAttribute('data-draggable-initialized', 'true');
        }
    }
}
