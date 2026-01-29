/**
 * SSH-Manage 主入口文件
 */

import { TabManager } from './components/TabManager.js';
import { ConnectForm } from './components/ConnectForm.js';
import { HistoryManager } from './components/HistoryManager.js';

// 全局状态
const state = {
    tabManager: null,
    connectForm: null,
    historyManager: null,
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
        onTabChange: updateConnectionCount,
        onTabClose: (sessionId) => {
            updateConnectionCount();
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

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);
