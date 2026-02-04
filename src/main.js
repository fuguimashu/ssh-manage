/**
 * SSH-Manage 主入口文件
 */

import { TabManager } from './components/TabManager.js';
import { ConnectForm } from './components/ConnectForm.js';
import { HistoryManager } from './components/HistoryManager.js';
import { FileManager } from './components/FileManager.js';

// 全局状态
const state = {
    tabManager: null,
    connectForm: null,
    historyManager: null,
    fileManager: null,
    currentView: 'terminal',
    activeSessionId: null,
    drawerOpen: false
};

/**
 * 初始化应用
 */
function initApp() {
    console.log('[App] 初始化 SSH-Manage...');

    // 初始化历史管理器
    state.historyManager = new HistoryManager({
        container: document.getElementById('historyList'),
        onSelect: (connection) => {
            // 填充表单并打开抽屉
            openDrawer();
            setTimeout(() => {
                state.connectForm.fillForm(connection);
            }, 100);
        },
        onConnect: (connection) => {
            createNewConnection(connection);
        }
    });

    // 初始化标签管理器
    state.tabManager = new TabManager({
        container: document.getElementById('tabsContainer'),
        terminalWrapper: document.getElementById('terminalsWrapper'),
        placeholder: document.getElementById('terminalPlaceholder'),
        onTabChange: (tabId) => {
            updateConnectionCount();
            // 更新当前会话 ID
            if (tabId) {
                const tab = state.tabManager.tabs.get(tabId);
                // sessionId 存储在 terminal 组件中
                if (tab && tab.terminal && tab.terminal.sessionId) {
                    state.activeSessionId = tab.terminal.sessionId;
                    // 更新文件管理器会话并刷新
                    if (state.fileManager) {
                        state.fileManager.setSessionId(tab.terminal.sessionId);
                        // 如果当前在文件视图，刷新文件列表（使用保存的路径）
                        if (state.currentView === 'files') {
                            state.fileManager.loadDirectory();
                        }
                    }
                }
            }
            // 显示视图切换标签
            showViewTabs();
        },
        onTabClose: (sessionId) => {
            updateConnectionCount();
            // 如果没有活动标签，隐藏视图切换
            if (state.tabManager.tabs.size === 0) {
                hideViewTabs();
            }
        },
        onStatusChange: (tabId, status) => {
            // 连接状态变化时更新计数
            updateConnectionCount();
            // 连接成功时保存 sessionId
            if (status === 'connected') {
                const tab = state.tabManager.tabs.get(tabId);
                // sessionId 存储在 terminal 组件中
                console.log('[App] 连接成功, tab:', tab);
                console.log('[App] terminal:', tab?.terminal);
                console.log('[App] sessionId:', tab?.terminal?.sessionId);
                if (tab && tab.terminal && tab.terminal.sessionId) {
                    state.activeSessionId = tab.terminal.sessionId;
                    console.log('[App] 设置 activeSessionId:', state.activeSessionId);
                    if (state.fileManager) {
                        state.fileManager.setSessionId(tab.terminal.sessionId);
                        console.log('[App] 设置 FileManager sessionId:', tab.terminal.sessionId);
                    }
                }
            }
        }
    });

    // 初始化连接表单
    state.connectForm = new ConnectForm({
        form: document.getElementById('connectForm'),
        onSubmit: (config) => {
            createNewConnection(config);
            closeDrawer();
        }
    });

    // 绑定新建按钮 - 打开抽屉
    document.getElementById('tabAdd').addEventListener('click', () => {
        openDrawer();
    });

    // 绑定关闭抽屉按钮
    document.getElementById('drawerClose').addEventListener('click', () => {
        closeDrawer();
    });

    // 绑定遮罩层点击关闭
    document.getElementById('drawerOverlay').addEventListener('click', () => {
        closeDrawer();
    });

    // ESC 键关闭抽屉
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.drawerOpen) {
            closeDrawer();
        }
    });

    // 更新时间显示
    updateClock();
    setInterval(updateClock, 1000);

    // 渲染历史记录
    state.historyManager.render();

    // 初始化面板固定功能
    initPanelPin();

    // 初始化文件管理器
    state.fileManager = new FileManager({
        container: document.getElementById('fileManagerContainer'),
        onError: (err) => {
            console.error('[FileManager]', err);
        }
    });

    // 初始化视图切换
    initViewTabs();

    console.log('[App] 初始化完成');
}

/**
 * 创建新的 SSH 连接
 */
function createNewConnection(config) {
    const { host, port, username, password, saveConnection } = config;

    // 创建新标签页
    state.tabManager.createTab({
        host,
        port,
        username,
        password
    });

    // 保存连接历史
    if (saveConnection !== false) {
        state.historyManager.addConnection({
            host,
            port,
            username,
            password
        });
    }
}

/**
 * 打开连接抽屉
 */
function openDrawer() {
    const drawer = document.getElementById('connectDrawer');
    const overlay = document.getElementById('drawerOverlay');

    drawer.classList.add('open');
    overlay.classList.add('visible');
    state.drawerOpen = true;

    // 清空表单并聚焦
    state.connectForm.clearForm();
    setTimeout(() => {
        document.getElementById('host').focus();
    }, 300);
}

/**
 * 关闭连接抽屉
 */
function closeDrawer() {
    const drawer = document.getElementById('connectDrawer');
    const overlay = document.getElementById('drawerOverlay');

    drawer.classList.remove('open');
    overlay.classList.remove('visible');
    state.drawerOpen = false;
}

/**
 * 更新连接计数
 */
function updateConnectionCount() {
    const count = state.tabManager.getActiveCount();
    document.getElementById('connectionCount').textContent = count;
}

/**
 * 更新时钟显示
 */
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    document.getElementById('currentTime').textContent = timeStr;
}

/**
 * 初始化面板固定功能
 */
function initPanelPin() {
    const panel = document.getElementById('historyPanel');
    const pinBtn = document.getElementById('panelPin');
    const trigger = document.getElementById('panelTrigger');
    const terminalArea = document.getElementById('terminalArea');

    // 从 localStorage 读取固定状态，默认为固定
    let isPinned = localStorage.getItem('panel_pinned') !== 'false';

    // 应用初始状态
    updatePanelState(isPinned);

    // 固定按钮点击
    pinBtn.addEventListener('click', () => {
        isPinned = !isPinned;
        localStorage.setItem('panel_pinned', isPinned);
        updatePanelState(isPinned);
    });

    // 触发器点击 - 临时显示面板
    trigger.addEventListener('click', () => {
        panel.classList.remove('collapsed');
        trigger.classList.remove('visible');
        terminalArea.classList.remove('panel-collapsed');
    });

    // 面板鼠标离开时，如果未固定则折叠
    panel.addEventListener('mouseleave', () => {
        if (!isPinned) {
            panel.classList.add('collapsed');
            trigger.classList.add('visible');
            terminalArea.classList.add('panel-collapsed');
        }
    });

    function updatePanelState(pinned) {
        if (pinned) {
            pinBtn.classList.add('pinned');
            panel.classList.remove('collapsed');
            trigger.classList.remove('visible');
            terminalArea.classList.remove('panel-collapsed');
        } else {
            pinBtn.classList.remove('pinned');
            panel.classList.add('collapsed');
            trigger.classList.add('visible');
            terminalArea.classList.add('panel-collapsed');
        }
    }
}

/**
 * 初始化视图切换
 */
function initViewTabs() {
    const viewTabs = document.getElementById('viewTabs');
    const terminalView = document.getElementById('terminalView');
    const filesView = document.getElementById('filesView');
    const tabs = viewTabs.querySelectorAll('.view-tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const view = tab.dataset.view;
            switchView(view);
        });
    });
}

/**
 * 切换视图
 */
function switchView(view) {
    const viewTabs = document.getElementById('viewTabs');
    const terminalView = document.getElementById('terminalView');
    const filesView = document.getElementById('filesView');
    const tabs = viewTabs.querySelectorAll('.view-tab');

    // 更新标签激活状态
    tabs.forEach(tab => {
        if (tab.dataset.view === view) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // 切换视图
    if (view === 'terminal') {
        terminalView.classList.remove('hidden');
        filesView.classList.add('hidden');
    } else if (view === 'files') {
        terminalView.classList.add('hidden');
        filesView.classList.remove('hidden');
        // 加载文件目录（保持当前路径，首次加载时才用根目录）
        console.log('[App] 切换到文件视图, activeSessionId:', state.activeSessionId);
        console.log('[App] fileManager.sessionId:', state.fileManager?.sessionId);
        if (state.activeSessionId && state.fileManager) {
            // 如果文件列表为空，加载根目录；否则保持当前路径
            if (state.fileManager.files.length === 0) {
                state.fileManager.loadDirectory('/');
            }
        }
    }

    state.currentView = view;
}

/**
 * 显示视图切换标签
 */
function showViewTabs() {
    const viewTabs = document.getElementById('viewTabs');
    viewTabs.classList.remove('hidden');
}

/**
 * 隐藏视图切换标签
 */
function hideViewTabs() {
    const viewTabs = document.getElementById('viewTabs');
    viewTabs.classList.add('hidden');
    // 切换回终端视图
    switchView('terminal');
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);
