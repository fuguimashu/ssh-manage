import { EventEmitter } from 'events';

/**
 * SFTP 管理器
 * 封装 ssh2 的 SFTP 功能，提供文件操作 API
 */
export class SFTPManager extends EventEmitter {
    constructor(sshClient) {
        super();
        this.sshClient = sshClient;
        this.sftp = null;
        this.connected = false;
    }

    /**
     * 建立 SFTP 会话
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.connected && this.sftp) {
                resolve();
                return;
            }

            this.sshClient.sftp((err, sftp) => {
                if (err) {
                    console.error('[SFTPManager] SFTP 会话创建失败:', err.message);
                    reject(err);
                    return;
                }

                this.sftp = sftp;
                this.connected = true;
                console.log('[SFTPManager] SFTP 会话已建立');

                // 监听 SFTP 关闭事件
                sftp.on('close', () => {
                    this.connected = false;
                    this.sftp = null;
                    console.log('[SFTPManager] SFTP 会话已关闭');
                    this.emit('close');
                });

                resolve();
            });
        });
    }

    /**
     * 列出目录内容
     * @param {string} remotePath - 远程目录路径
     * @returns {Promise<Array>} 文件列表
     */
    async list(remotePath) {
        this._checkConnection();

        return new Promise((resolve, reject) => {
            this.sftp.readdir(remotePath, (err, list) => {
                if (err) {
                    reject(err);
                    return;
                }

                // 格式化文件列表
                const files = list.map(item => ({
                    name: item.filename,
                    type: this._getFileType(item.attrs),
                    size: item.attrs.size,
                    mode: item.attrs.mode,
                    mtime: new Date(item.attrs.mtime * 1000),
                    atime: new Date(item.attrs.atime * 1000),
                    uid: item.attrs.uid,
                    gid: item.attrs.gid,
                    permissions: this._formatPermissions(item.attrs.mode)
                }));

                // 按类型和名称排序：目录在前，文件在后
                files.sort((a, b) => {
                    if (a.type === 'directory' && b.type !== 'directory') return -1;
                    if (a.type !== 'directory' && b.type === 'directory') return 1;
                    return a.name.localeCompare(b.name);
                });

                resolve(files);
            });
        });
    }

    /**
     * 获取文件/目录信息
     * @param {string} remotePath - 远程路径
     * @returns {Promise<Object>} 文件信息
     */
    async stat(remotePath) {
        this._checkConnection();

        return new Promise((resolve, reject) => {
            this.sftp.stat(remotePath, (err, stats) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve({
                    type: this._getFileType(stats),
                    size: stats.size,
                    mode: stats.mode,
                    mtime: new Date(stats.mtime * 1000),
                    atime: new Date(stats.atime * 1000),
                    uid: stats.uid,
                    gid: stats.gid,
                    permissions: this._formatPermissions(stats.mode)
                });
            });
        });
    }

    /**
     * 创建目录
     * @param {string} remotePath - 远程目录路径
     * @returns {Promise<void>}
     */
    async mkdir(remotePath) {
        this._checkConnection();

        return new Promise((resolve, reject) => {
            this.sftp.mkdir(remotePath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log(`[SFTPManager] 目录已创建: ${remotePath}`);
                resolve();
            });
        });
    }

    /**
     * 删除目录
     * @param {string} remotePath - 远程目录路径
     * @returns {Promise<void>}
     */
    async rmdir(remotePath) {
        this._checkConnection();

        return new Promise((resolve, reject) => {
            this.sftp.rmdir(remotePath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log(`[SFTPManager] 目录已删除: ${remotePath}`);
                resolve();
            });
        });
    }

    /**
     * 递归删除目录（包括非空目录）
     * @param {string} remotePath - 远程目录路径
     * @returns {Promise<void>}
     */
    async rmdirRecursive(remotePath) {
        this._checkConnection();

        // 获取目录内容
        const files = await this.list(remotePath);

        // 递归删除所有内容
        for (const file of files) {
            const fullPath = remotePath.endsWith('/')
                ? remotePath + file.name
                : remotePath + '/' + file.name;

            if (file.type === 'directory') {
                // 递归删除子目录
                await this.rmdirRecursive(fullPath);
            } else {
                // 删除文件
                await this.unlink(fullPath);
            }
        }

        // 删除空目录
        await this.rmdir(remotePath);
        console.log(`[SFTPManager] 目录已递归删除: ${remotePath}`);
    }

    /**
     * 删除文件
     * @param {string} remotePath - 远程文件路径
     * @returns {Promise<void>}
     */
    async unlink(remotePath) {
        this._checkConnection();

        return new Promise((resolve, reject) => {
            this.sftp.unlink(remotePath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log(`[SFTPManager] 文件已删除: ${remotePath}`);
                resolve();
            });
        });
    }

    /**
     * 重命名文件/目录
     * @param {string} oldPath - 原路径
     * @param {string} newPath - 新路径
     * @returns {Promise<void>}
     */
    async rename(oldPath, newPath) {
        this._checkConnection();

        return new Promise((resolve, reject) => {
            this.sftp.rename(oldPath, newPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log(`[SFTPManager] 重命名: ${oldPath} -> ${newPath}`);
                resolve();
            });
        });
    }

    /**
     * 创建读取流（用于下载）
     * @param {string} remotePath - 远程文件路径
     * @param {Object} options - 选项
     * @returns {ReadStream}
     */
    createReadStream(remotePath, options = {}) {
        this._checkConnection();
        return this.sftp.createReadStream(remotePath, options);
    }

    /**
     * 创建写入流（用于上传）
     * @param {string} remotePath - 远程文件路径
     * @param {Object} options - 选项
     * @returns {WriteStream}
     */
    createWriteStream(remotePath, options = {}) {
        this._checkConnection();
        return this.sftp.createWriteStream(remotePath, options);
    }

    /**
     * 写入数据到指定位置（用于分片上传）
     * @param {string} remotePath - 远程文件路径
     * @param {Buffer} data - 数据
     * @param {number} offset - 偏移量
     * @returns {Promise<void>}
     */
    async writeChunk(remotePath, data, offset) {
        this._checkConnection();

        return new Promise((resolve, reject) => {
            this.sftp.open(remotePath, 'a', (err, handle) => {
                if (err) {
                    reject(err);
                    return;
                }

                this.sftp.write(handle, data, 0, data.length, offset, (writeErr) => {
                    this.sftp.close(handle, () => {
                        if (writeErr) {
                            reject(writeErr);
                            return;
                        }
                        resolve();
                    });
                });
            });
        });
    }

    /**
     * 检查连接状态
     * @private
     */
    _checkConnection() {
        if (!this.connected || !this.sftp) {
            throw new Error('SFTP 会话未建立');
        }
    }

    /**
     * 获取文件类型
     * @param {Object} attrs - 文件属性
     * @returns {string} 文件类型
     * @private
     */
    _getFileType(attrs) {
        const mode = attrs.mode;
        if ((mode & 0o170000) === 0o040000) return 'directory';
        if ((mode & 0o170000) === 0o120000) return 'symlink';
        if ((mode & 0o170000) === 0o100000) return 'file';
        return 'other';
    }

    /**
     * 格式化权限字符串
     * @param {number} mode - 文件模式
     * @returns {string} 权限字符串 (例如: rwxr-xr-x)
     * @private
     */
    _formatPermissions(mode) {
        const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
        const owner = perms[(mode >> 6) & 7];
        const group = perms[(mode >> 3) & 7];
        const other = perms[mode & 7];
        return owner + group + other;
    }

    /**
     * 检查是否已连接
     * @returns {boolean}
     */
    isConnected() {
        return this.connected && this.sftp !== null;
    }

    /**
     * 关闭 SFTP 会话
     */
    close() {
        if (this.sftp) {
            this.sftp.end();
            this.sftp = null;
        }
        this.connected = false;
        console.log('[SFTPManager] SFTP 会话已关闭');
    }
}
