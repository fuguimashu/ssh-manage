import { Client } from 'ssh2';
import { EventEmitter } from 'events';

/**
 * SSH 连接管理器
 * 封装 ssh2 库，提供简洁的 API
 */
export class SSHManager extends EventEmitter {
    constructor() {
        super();
        this.client = new Client();
        this.stream = null;
        this.connected = false;

        this._setupEventHandlers();
    }

    /**
     * 设置事件处理器
     */
    _setupEventHandlers() {
        this.client.on('ready', () => {
            console.log('[SSHManager] SSH 客户端就绪');
            this._openShell();
        });

        this.client.on('error', (err) => {
            console.error('[SSHManager] SSH 错误:', err.message);
            this.connected = false;
            this.emit('error', err);
        });

        this.client.on('close', () => {
            console.log('[SSHManager] SSH 连接关闭');
            this.connected = false;
            this.stream = null;
            this.emit('close');
        });

        this.client.on('end', () => {
            console.log('[SSHManager] SSH 连接结束');
            this.connected = false;
        });
    }

    /**
     * 打开 Shell 会话
     */
    _openShell() {
        this.client.shell({ term: 'xterm-256color' }, (err, stream) => {
            if (err) {
                this.emit('error', err);
                return;
            }

            this.stream = stream;
            this.connected = true;

            stream.on('data', (data) => {
                this.emit('data', data);
            });

            stream.on('close', () => {
                this.connected = false;
                this.stream = null;
                this.client.end();
            });

            stream.stderr.on('data', (data) => {
                this.emit('data', data);
            });

            this.emit('ready');
        });
    }

    /**
     * 连接到 SSH 服务器
     * @param {Object} config - 连接配置
     * @param {string} config.host - 主机地址
     * @param {number} config.port - 端口号
     * @param {string} config.username - 用户名
     * @param {string} config.password - 密码
     */
    connect(config) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('连接超时'));
            }, 30000);

            this.once('ready', () => {
                clearTimeout(timeout);
                resolve();
            });

            this.once('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });

            console.log(`[SSHManager] 正在连接 ${config.username}@${config.host}:${config.port}`);

            this.client.connect({
                host: config.host,
                port: config.port || 22,
                username: config.username,
                password: config.password,
                readyTimeout: 30000,
                keepaliveInterval: 10000,
                keepaliveCountMax: 3,
                // 调试选项
                debug: process.env.SSH_DEBUG ? console.log : undefined
            });
        });
    }

    /**
     * 写入数据到终端
     * @param {string} data - 要写入的数据
     */
    write(data) {
        if (this.stream && this.connected) {
            this.stream.write(data);
        }
    }

    /**
     * 调整终端大小
     * @param {number} cols - 列数
     * @param {number} rows - 行数
     */
    resize(cols, rows) {
        if (this.stream && this.connected) {
            this.stream.setWindow(rows, cols, 0, 0);
        }
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }
        if (this.client) {
            this.client.end();
        }
        this.connected = false;
    }

    /**
     * 检查是否已连接
     * @returns {boolean}
     */
    isConnected() {
        return this.connected && this.stream !== null;
    }
}
