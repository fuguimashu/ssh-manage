import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// 配置
const CONFIG = {
    CHUNK_SIZE: 5 * 1024 * 1024,  // 5MB 分片大小
    MAX_FILE_SIZE: 1024 * 1024 * 1024,  // 1GB 最大文件大小
    TEMP_DIR: '/tmp/ssh-manage-uploads',
    UPLOAD_TIMEOUT: 30 * 60 * 1000,  // 30分钟超时
    MAX_CONCURRENT_CHUNKS: 3,  // 最大并发分片数
    CHUNK_RETRY_COUNT: 3  // 分片重试次数
};

/**
 * 分片上传管理器
 * 管理大文件的分片上传和断点续传
 */
export class UploadManager extends EventEmitter {
    constructor() {
        super();
        this.uploads = new Map();  // uploadId -> 上传任务信息
        this._cleanupTimer = null;
        this._ensureTempDir();
        this._startCleanupInterval();
    }

    /**
     * 确保临时目录存在
     * @private
     */
    _ensureTempDir() {
        if (!fs.existsSync(CONFIG.TEMP_DIR)) {
            fs.mkdirSync(CONFIG.TEMP_DIR, { recursive: true });
            console.log(`[UploadManager] 创建临时目录: ${CONFIG.TEMP_DIR}`);
        }
    }

    /**
     * 启动定期清理过期上传任务
     * @private
     */
    _startCleanupInterval() {
        this._cleanupTimer = setInterval(() => {
            this._cleanupExpiredUploads();
        }, 5 * 60 * 1000);  // 每5分钟检查一次
        // 允许进程退出，即使定时器还在运行
        this._cleanupTimer.unref();
    }

    /**
     * 停止清理定时器
     */
    stop() {
        if (this._cleanupTimer) {
            clearInterval(this._cleanupTimer);
            this._cleanupTimer = null;
        }
    }

    /**
     * 清理过期的上传任务
     * @private
     */
    _cleanupExpiredUploads() {
        const now = Date.now();
        for (const [uploadId, upload] of this.uploads) {
            if (now - upload.lastActivity > CONFIG.UPLOAD_TIMEOUT) {
                console.log(`[UploadManager] 清理过期上传: ${uploadId}`);
                this._cleanupUpload(uploadId);
            }
        }
    }

    /**
     * 初始化上传任务
     * @param {string} sessionId - 会话ID
     * @param {Object} fileInfo - 文件信息
     * @param {string} fileInfo.filename - 文件名
     * @param {number} fileInfo.fileSize - 文件大小
     * @param {string} fileInfo.remotePath - 远程目标路径
     * @param {string} [fileInfo.fileHash] - 文件哈希（可选，用于校验）
     * @returns {Object} 上传任务信息
     */
    initUpload(sessionId, fileInfo) {
        const { filename, fileSize, remotePath, fileHash } = fileInfo;

        // 验证文件大小
        if (fileSize > CONFIG.MAX_FILE_SIZE) {
            throw new Error(`文件大小超过限制 (最大 ${CONFIG.MAX_FILE_SIZE / 1024 / 1024 / 1024}GB)`);
        }

        // 生成上传ID
        const uploadId = this._generateUploadId();

        // 计算分片数量
        const totalChunks = Math.ceil(fileSize / CONFIG.CHUNK_SIZE);

        // 创建临时目录
        const tempPath = path.join(CONFIG.TEMP_DIR, uploadId);
        fs.mkdirSync(tempPath, { recursive: true });

        // 创建上传任务
        const upload = {
            uploadId,
            sessionId,
            filename,
            fileSize,
            remotePath: path.join(remotePath, filename),
            fileHash,
            totalChunks,
            chunkSize: CONFIG.CHUNK_SIZE,
            uploadedChunks: new Set(),
            tempPath,
            status: 'initialized',
            createdAt: Date.now(),
            lastActivity: Date.now(),
            progress: 0
        };

        this.uploads.set(uploadId, upload);
        console.log(`[UploadManager] 初始化上传: ${uploadId}, 文件: ${filename}, 分片数: ${totalChunks}`);

        return {
            uploadId,
            totalChunks,
            chunkSize: CONFIG.CHUNK_SIZE,
            uploadedChunks: []
        };
    }

    /**
     * 上传分片
     * @param {string} uploadId - 上传ID
     * @param {number} chunkIndex - 分片索引 (0-based)
     * @param {Buffer} data - 分片数据
     * @returns {Object} 上传进度
     */
    async uploadChunk(uploadId, chunkIndex, data) {
        const upload = this.uploads.get(uploadId);
        if (!upload) {
            throw new Error('上传任务不存在');
        }

        // 验证分片索引
        if (chunkIndex < 0 || chunkIndex >= upload.totalChunks) {
            throw new Error(`无效的分片索引: ${chunkIndex}`);
        }

        // 如果分片已上传，跳过
        if (upload.uploadedChunks.has(chunkIndex)) {
            console.log(`[UploadManager] 分片已存在，跳过: ${uploadId}/${chunkIndex}`);
            return this._getUploadProgress(upload);
        }

        // 保存分片到临时文件
        const chunkPath = path.join(upload.tempPath, `chunk_${chunkIndex}`);
        await fs.promises.writeFile(chunkPath, data);

        // 标记分片已上传
        upload.uploadedChunks.add(chunkIndex);
        upload.lastActivity = Date.now();
        upload.status = 'uploading';
        upload.progress = (upload.uploadedChunks.size / upload.totalChunks) * 100;

        console.log(`[UploadManager] 分片上传完成: ${uploadId}/${chunkIndex}, 进度: ${upload.progress.toFixed(1)}%`);

        this.emit('progress', {
            uploadId,
            progress: upload.progress,
            uploadedChunks: upload.uploadedChunks.size,
            totalChunks: upload.totalChunks
        });

        return this._getUploadProgress(upload);
    }

    /**
     * 完成上传，合并分片到远程服务器
     * @param {string} uploadId - 上传ID
     * @param {SFTPManager} sftpManager - SFTP管理器
     * @returns {Object} 结果
     */
    async completeUpload(uploadId, sftpManager) {
        const upload = this.uploads.get(uploadId);
        if (!upload) {
            throw new Error('上传任务不存在');
        }

        // 验证所有分片都已上传
        if (upload.uploadedChunks.size !== upload.totalChunks) {
            const missing = [];
            for (let i = 0; i < upload.totalChunks; i++) {
                if (!upload.uploadedChunks.has(i)) {
                    missing.push(i);
                }
            }
            throw new Error(`缺少分片: ${missing.join(', ')}`);
        }

        upload.status = 'merging';
        console.log(`[UploadManager] 开始合并文件: ${uploadId} -> ${upload.remotePath}`);

        try {
            // 创建远程文件写入流
            const writeStream = sftpManager.createWriteStream(upload.remotePath);

            // 按顺序读取并写入分片
            for (let i = 0; i < upload.totalChunks; i++) {
                const chunkPath = path.join(upload.tempPath, `chunk_${i}`);
                const chunkData = await fs.promises.readFile(chunkPath);

                await new Promise((resolve, reject) => {
                    const canContinue = writeStream.write(chunkData);
                    if (canContinue) {
                        resolve();
                    } else {
                        writeStream.once('drain', resolve);
                    }
                });
            }

            // 关闭写入流
            await new Promise((resolve, reject) => {
                writeStream.end();
                writeStream.on('close', resolve);
                writeStream.on('error', reject);
            });

            upload.status = 'completed';
            console.log(`[UploadManager] 文件上传完成: ${upload.remotePath}`);

            // 清理临时文件
            this._cleanupUpload(uploadId);

            return {
                success: true,
                remotePath: upload.remotePath,
                fileSize: upload.fileSize
            };
        } catch (err) {
            upload.status = 'error';
            console.error(`[UploadManager] 合并文件失败: ${err.message}`);
            throw err;
        }
    }

    /**
     * 获取上传状态（用于断点续传）
     * @param {string} uploadId - 上传ID
     * @returns {Object|null} 上传状态
     */
    getUploadStatus(uploadId) {
        const upload = this.uploads.get(uploadId);
        if (!upload) {
            return null;
        }

        return {
            uploadId: upload.uploadId,
            filename: upload.filename,
            fileSize: upload.fileSize,
            remotePath: upload.remotePath,
            totalChunks: upload.totalChunks,
            chunkSize: upload.chunkSize,
            uploadedChunks: Array.from(upload.uploadedChunks),
            status: upload.status,
            progress: upload.progress,
            createdAt: upload.createdAt,
            lastActivity: upload.lastActivity
        };
    }

    /**
     * 取消上传
     * @param {string} uploadId - 上传ID
     */
    cancelUpload(uploadId) {
        const upload = this.uploads.get(uploadId);
        if (upload) {
            upload.status = 'cancelled';
            this._cleanupUpload(uploadId);
            console.log(`[UploadManager] 上传已取消: ${uploadId}`);
        }
    }

    /**
     * 获取上传进度
     * @param {Object} upload - 上传任务
     * @returns {Object}
     * @private
     */
    _getUploadProgress(upload) {
        return {
            uploadId: upload.uploadId,
            progress: upload.progress,
            uploadedChunks: Array.from(upload.uploadedChunks),
            totalChunks: upload.totalChunks,
            status: upload.status
        };
    }

    /**
     * 生成上传ID
     * @returns {string}
     * @private
     */
    _generateUploadId() {
        return `upload_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    /**
     * 清理上传任务
     * @param {string} uploadId - 上传ID
     * @private
     */
    _cleanupUpload(uploadId) {
        const upload = this.uploads.get(uploadId);
        if (upload) {
            // 删除临时文件
            if (fs.existsSync(upload.tempPath)) {
                fs.rmSync(upload.tempPath, { recursive: true, force: true });
            }
            this.uploads.delete(uploadId);
        }
    }

    /**
     * 获取配置
     * @returns {Object}
     */
    static getConfig() {
        return { ...CONFIG };
    }

    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    static updateConfig(newConfig) {
        Object.assign(CONFIG, newConfig);
    }
}

// 导出配置供外部使用
export { CONFIG as UPLOAD_CONFIG };
