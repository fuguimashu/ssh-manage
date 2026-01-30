import { Terminal } from './Terminal.js';

/**
 * 标签页管理器
 * 管理多个终端标签页
 */
export class TabManager {
    constructor(options = {}) {
        this.container = options.container;
        this.terminalWrapper = options.terminalWrapper;
        this.placeholder = options.placeholder;
        this.onTabChange = options.onTabChange || (() => { });
        this.onTabClose = options.onTabClose || (() => { });
        this.onStatusChange = options.onStatusChange || (() => { });

        this.tabs = new Map();
        this.activeTabId = null;
        this.tabCounter = 0;
    }

    /**
     * 创建新标签页
     */
    createTab(config) {
        const tabId = `tab_${++this.tabCounter}`;

        // 创建标签元素
        const tabEl = this._createTabElement(tabId, config);
        this.container.appendChild(tabEl);

        // 创建终端容器
        const terminalContainer = document.createElement('div');
        terminalContainer.className = 'terminal-container';
        terminalContainer.id = `terminal_${tabId}`;
        this.terminalWrapper.appendChild(terminalContainer);

        // 创建终端实例
        const terminal = new Terminal({
            container: terminalContainer,
            config: config,
            onStatusChange: (status) => {
                this._updateTabStatus(tabId, status);
            },
            onClose: () => {
                // 终端关闭时的处理
            }
        });

        // 存储标签数据
        this.tabs.set(tabId, {
            id: tabId,
            element: tabEl,
            terminalContainer,
            terminal,
            config,
            status: 'connecting'
        });

        // 隐藏占位符
        this.placeholder.classList.add('hidden');

        // 激活新标签
        this.activateTab(tabId);

        return tabId;
    }

    /**
     * 创建标签元素
     */
    _createTabElement(tabId, config) {
        const tab = document.createElement('div');
        tab.className = 'tab-item';
        tab.dataset.tabId = tabId;

        tab.innerHTML = `
      <span class="tab-status connecting"></span>
      <span class="tab-title">${config.username}@${config.host}</span>
      <button class="tab-close" title="关闭">×</button>
    `;

        // 点击激活
        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                this.activateTab(tabId);
            }
        });

        // 关闭按钮
        tab.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabId);
        });

        return tab;
    }

    /**
     * 激活标签页
     */
    activateTab(tabId) {
        // 取消之前的激活状态
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            const prevTab = this.tabs.get(this.activeTabId);
            prevTab.element.classList.remove('active');
            prevTab.terminalContainer.classList.remove('active');
        }

        // 激活新标签
        const tab = this.tabs.get(tabId);
        if (tab) {
            tab.element.classList.add('active');
            tab.terminalContainer.classList.add('active');
            this.activeTabId = tabId;
            this.onTabChange(tabId);

            // 延迟重新适配终端大小，确保容器已显示
            requestAnimationFrame(() => {
                tab.terminal.refit();
                tab.terminal.focus();
            });
        }
    }

    /**
     * 关闭标签页
     */
    closeTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // 销毁终端
        tab.terminal.destroy();

        // 移除 DOM 元素
        tab.element.remove();
        tab.terminalContainer.remove();

        // 从 Map 中删除
        this.tabs.delete(tabId);

        // 如果关闭的是当前激活的标签
        if (this.activeTabId === tabId) {
            this.activeTabId = null;

            // 激活其他标签
            if (this.tabs.size > 0) {
                const nextTabId = this.tabs.keys().next().value;
                this.activateTab(nextTabId);
            } else {
                // 没有标签时显示占位符
                this.placeholder.classList.remove('hidden');
            }
        }

        this.onTabClose(tabId);
    }

    /**
     * 更新标签状态
     */
    _updateTabStatus(tabId, status) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        tab.status = status;

        const statusEl = tab.element.querySelector('.tab-status');
        statusEl.className = 'tab-status';

        switch (status) {
            case 'connecting':
                statusEl.classList.add('connecting');
                break;
            case 'connected':
                statusEl.classList.add('connected');
                break;
            case 'disconnected':
                statusEl.classList.add('disconnected');
                break;
        }

        // 通知状态变化，更新连接计数
        this.onStatusChange(tabId, status);
    }

    /**
     * 获取活跃连接数
     */
    getActiveCount() {
        let count = 0;
        for (const tab of this.tabs.values()) {
            if (tab.status === 'connected') {
                count++;
            }
        }
        return count;
    }

    /**
     * 获取所有标签
     */
    getAllTabs() {
        return Array.from(this.tabs.values());
    }
}
