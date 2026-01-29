import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { WebSocketClient } from '../utils/websocket.js';
import 'xterm/css/xterm.css';

/**
 * 终端组件
 * 封装 xterm.js 和 WebSocket 通信
 */
export class Terminal {
    constructor(options = {}) {
        this.container = options.container;
        this.config = options.config;
        this.onStatusChange = options.onStatusChange || (() => { });
        this.onClose = options.onClose || (() => { });

        this.terminal = null;
        this.fitAddon = null;
        this.wsClient = null;
        this.sessionId = null;
        this.status = 'disconnected'; // disconnected, connecting, connected

        this._init();
    }

    /**
     * 初始化终端
     */
    _init() {
        // 创建 xterm 实例
        this.terminal = new XTerm({
            cursorBlink: true,
            cursorStyle: 'bar',
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            lineHeight: 1.2,
            letterSpacing: 0,
            theme: {
                background: '#0a0a0f',
                foreground: '#e0e0e0',
                cursor: '#00ff88',
                cursorAccent: '#0a0a0f',
                selectionBackground: 'rgba(0, 212, 255, 0.3)',
                selectionForeground: '#ffffff',
                black: '#1a1a24',
                red: '#ff4444',
                green: '#00ff88',
                yellow: '#ffcc00',
                blue: '#00d4ff',
                magenta: '#b14aff',
                cyan: '#00d4ff',
                white: '#e0e0e0',
                brightBlack: '#555555',
                brightRed: '#ff6666',
                brightGreen: '#33ff99',
                brightYellow: '#ffdd44',
                brightBlue: '#44ddff',
                brightMagenta: '#cc66ff',
                brightCyan: '#44ddff',
                brightWhite: '#ffffff'
            },
            allowProposedApi: true
        });

        // 添加插件
        this.fitAddon = new FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon());

        // 挂载到容器
        this.terminal.open(this.container);

        // 延迟执行 fit，确保容器尺寸已确定
        // 使用多次延迟来确保尺寸正确
        requestAnimationFrame(() => {
            this._safeFit();
            // 再次延迟确保完全渲染
            setTimeout(() => {
                this._safeFit();
            }, 100);
            setTimeout(() => {
                this._safeFit();
            }, 300);
        });

        // 监听窗口大小变化
        this._resizeObserver = new ResizeObserver(() => {
            this._handleResize();
        });
        this._resizeObserver.observe(this.container);

        // 监听终端输入
        this.terminal.onData((data) => {
            if (this.wsClient && this.status === 'connected') {
                this.wsClient.sendData(data);
            }
        });

        // 连接到服务器
        this._connect();
    }

    /**
     * 安全地执行 fit
     */
    _safeFit() {
        if (this.fitAddon && this.container) {
            try {
                // 只有当容器可见且有尺寸时才执行 fit
                const rect = this.container.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    this.fitAddon.fit();

                    // 如果已连接，发送新尺寸
                    if (this.wsClient && this.status === 'connected') {
                        const { cols, rows } = this.terminal;
                        this.wsClient.sendResize(cols, rows);
                    }
                }
            } catch (e) {
                // 忽略错误
            }
        }
    }

    /**
     * 重新适配终端大小（供外部调用）
     */
    refit() {
        this._safeFit();
    }

    /**
     * 连接到 SSH 服务器
     */
    async _connect() {
        this._setStatus('connecting');
        this._writeSystem('正在连接...');

        this.wsClient = new WebSocketClient({
            onConnected: (data) => {
                this.sessionId = data.sessionId;
                this._setStatus('connected');
                this._writeSystem(`已连接: ${data.message}`);

                // 发送终端大小
                const { cols, rows } = this.terminal;
                this.wsClient.sendResize(cols, rows);
            },
            onDisconnected: () => {
                this._setStatus('disconnected');
                this._writeSystem('连接已断开');
            },
            onData: (data) => {
                this.terminal.write(data);
            },
            onError: (error) => {
                this._writeError(error.message || '连接错误');
                if (this.status === 'connecting') {
                    this._setStatus('disconnected');
                }
            },
            onClose: () => {
                if (this.status === 'connected') {
                    this._setStatus('disconnected');
                    this._writeSystem('连接已关闭');
                }
            }
        });

        try {
            await this.wsClient.connect();
            this.wsClient.sendConnect(this.config);
        } catch (error) {
            this._writeError(`无法连接到服务器: ${error.message}`);
            this._setStatus('disconnected');
        }
    }

    /**
     * 处理大小调整
     */
    _handleResize() {
        if (this.fitAddon) {
            try {
                this.fitAddon.fit();

                if (this.wsClient && this.status === 'connected') {
                    const { cols, rows } = this.terminal;
                    this.wsClient.sendResize(cols, rows);
                }
            } catch (e) {
                // 忽略大小调整错误
            }
        }
    }

    /**
     * 设置状态
     */
    _setStatus(status) {
        this.status = status;
        this.onStatusChange(status);
    }

    /**
     * 写入系统消息
     */
    _writeSystem(message) {
        this.terminal.writeln(`\r\n\x1b[36m[系统]\x1b[0m ${message}\r\n`);
    }

    /**
     * 写入错误消息
     */
    _writeError(message) {
        this.terminal.writeln(`\r\n\x1b[31m[错误]\x1b[0m ${message}\r\n`);
    }

    /**
     * 获取当前状态
     */
    getStatus() {
        return this.status;
    }

    /**
     * 聚焦终端
     */
    focus() {
        if (this.terminal) {
            this.terminal.focus();
        }
    }

    /**
     * 销毁终端
     */
    destroy() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }

        if (this.wsClient) {
            this.wsClient.disconnect();
        }

        if (this.terminal) {
            this.terminal.dispose();
        }

        this.onClose();
    }
}
