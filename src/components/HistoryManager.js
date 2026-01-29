/**
 * 连接历史管理器
 * 使用 LocalStorage 保存连接历史
 */
export class HistoryManager {
    constructor(options = {}) {
        this.container = options.container;
        this.onSelect = options.onSelect || (() => { });
        this.onConnect = options.onConnect || (() => { });

        this.storageKey = 'ssh_manage_history';
        this.maxHistory = 20;

        this.connections = this._load();
    }

    /**
     * 从 LocalStorage 加载历史
     */
    _load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                const connections = JSON.parse(data);
                // 解码密码
                return connections.map(conn => ({
                    ...conn,
                    password: this._decode(conn.password)
                }));
            }
        } catch (e) {
            console.error('[History] 加载失败:', e);
        }
        return [];
    }

    /**
     * 保存到 LocalStorage
     */
    _save() {
        try {
            // 编码密码后保存
            const data = this.connections.map(conn => ({
                ...conn,
                password: this._encode(conn.password)
            }));
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (e) {
            console.error('[History] 保存失败:', e);
        }
    }

    /**
     * 简单编码密码 (Base64)
     * 注意：这只是简单的混淆，不是真正的加密
     */
    _encode(str) {
        if (!str) return '';
        try {
            return btoa(encodeURIComponent(str));
        } catch (e) {
            return '';
        }
    }

    /**
     * 解码密码
     */
    _decode(str) {
        if (!str) return '';
        try {
            return decodeURIComponent(atob(str));
        } catch (e) {
            return '';
        }
    }

    /**
     * 添加连接到历史
     */
    addConnection(connection) {
        const key = `${connection.username}@${connection.host}:${connection.port}`;

        // 移除重复项
        this.connections = this.connections.filter(c =>
            `${c.username}@${c.host}:${c.port}` !== key
        );

        // 添加到开头
        this.connections.unshift({
            host: connection.host,
            port: connection.port,
            username: connection.username,
            password: connection.password,
            lastUsed: Date.now()
        });

        // 限制数量
        if (this.connections.length > this.maxHistory) {
            this.connections = this.connections.slice(0, this.maxHistory);
        }

        this._save();
        this.render();
    }

    /**
     * 删除历史记录
     */
    removeConnection(index) {
        if (index >= 0 && index < this.connections.length) {
            this.connections.splice(index, 1);
            this._save();
            this.render();
        }
    }

    /**
     * 清空所有历史
     */
    clearAll() {
        this.connections = [];
        this._save();
        this.render();
    }

    /**
     * 渲染历史列表
     */
    render() {
        if (!this.container) return;

        if (this.connections.length === 0) {
            this.container.innerHTML = `
        <li class="history-empty">
          <div class="history-empty-icon">◇</div>
          <span>暂无连接记录</span>
          <span style="margin-top: 8px; font-size: 11px;">点击 + 创建新连接</span>
        </li>
      `;
            return;
        }

        this.container.innerHTML = this.connections.map((conn, index) => `
      <li class="history-item" data-index="${index}">
        <div class="history-item-info">
          <span class="history-item-host">${conn.host}:${conn.port}</span>
          <span class="history-item-user">${conn.username}</span>
        </div>
        <div class="history-item-actions">
          <button class="history-item-btn connect" title="连接" data-action="connect">▶</button>
          <button class="history-item-btn delete" title="删除" data-action="delete">×</button>
        </div>
      </li>
    `).join('');

        // 绑定事件
        this.container.querySelectorAll('.history-item').forEach((item) => {
            const index = parseInt(item.dataset.index, 10);
            const conn = this.connections[index];

            // 点击选择
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.history-item-btn')) {
                    this.onSelect(conn);
                }
            });

            // 连接按钮
            item.querySelector('[data-action="connect"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.onConnect(conn);
            });

            // 删除按钮
            item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeConnection(index);
            });
        });
    }

    /**
     * 获取所有历史记录
     */
    getAll() {
        return [...this.connections];
    }
}
