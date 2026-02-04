import express from 'express';
import path from 'path';
import { SFTPManager } from './sftp-manager.js';
import { UploadManager } from './upload-manager.js';

const router = express.Router();

// 分片上传管理器（单例）
const uploadManager = new UploadManager();

// 存储 SFTP 会话
const sftpSessions = new Map();

/**
 * 路径安全验证
 * 防止路径遍历攻击
 */
function validatePath(remotePath) {
    if (!remotePath || typeof remotePath !== 'string') {
        throw new Error('无效的路径');
    }

    // 规范化路径
    const normalized = path.posix.normalize(remotePath);

    // 检查是否包含路径遍历
    if (normalized.includes('..')) {
        throw new Error('不允许的路径遍历');
    }

    return normalized;
}

/**
 * 获取或创建 SFTP 会话
 */
async function getSFTPSession(sessionId, sessions) {
    // 调试：打印可用的会话
    console.log(`[SFTP] 查找会话: ${sessionId}`);
    console.log(`[SFTP] 可用会话: ${Array.from(sessions.keys()).join(', ') || '无'}`);

    // 检查 SSH 会话是否存在
    const session = sessions.get(sessionId);
    if (!session || !session.sshManager) {
        throw new Error('SSH 会话不存在');
    }

    // 检查是否已有 SFTP 会话
    if (sftpSessions.has(sessionId)) {
        const sftpManager = sftpSessions.get(sessionId);
        if (sftpManager.isConnected()) {
            return sftpManager;
        }
    }

    // 创建新的 SFTP 会话
    const sftpManager = new SFTPManager(session.sshManager.client);
    await sftpManager.connect();
    sftpSessions.set(sessionId, sftpManager);

    // SSH 关闭时清理 SFTP 会话
    session.sshManager.once('close', () => {
        if (sftpSessions.has(sessionId)) {
            sftpSessions.get(sessionId).close();
            sftpSessions.delete(sessionId);
        }
    });

    return sftpManager;
}

/**
 * 创建 SFTP 路由
 * @param {Map} sessions - SSH 会话存储
 */
export function createSFTPRoutes(sessions) {

    // ===== 目录和文件操作 =====

    /**
     * 列出目录内容
     * GET /api/sftp/:sessionId/list?path=/home/user
     */
    router.get('/:sessionId/list', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const remotePath = validatePath(req.query.path || '/');

            const sftpManager = await getSFTPSession(sessionId, sessions);
            const files = await sftpManager.list(remotePath);

            res.json({
                success: true,
                path: remotePath,
                files
            });
        } catch (err) {
            console.error('[SFTP API] 列出目录失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    /**
     * 获取文件/目录信息
     * GET /api/sftp/:sessionId/stat?path=/home/user/file.txt
     */
    router.get('/:sessionId/stat', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const remotePath = validatePath(req.query.path);

            const sftpManager = await getSFTPSession(sessionId, sessions);
            const stats = await sftpManager.stat(remotePath);

            res.json({
                success: true,
                path: remotePath,
                stats
            });
        } catch (err) {
            console.error('[SFTP API] 获取文件信息失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    /**
     * 创建目录
     * POST /api/sftp/:sessionId/mkdir
     * Body: { path: "/home/user/newdir" }
     */
    router.post('/:sessionId/mkdir', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const remotePath = validatePath(req.body.path);

            const sftpManager = await getSFTPSession(sessionId, sessions);
            await sftpManager.mkdir(remotePath);

            res.json({
                success: true,
                path: remotePath
            });
        } catch (err) {
            console.error('[SFTP API] 创建目录失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    /**
     * 删除目录（支持非空目录）
     * DELETE /api/sftp/:sessionId/rmdir?path=/home/user/dir
     */
    router.delete('/:sessionId/rmdir', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const remotePath = validatePath(req.query.path);

            const sftpManager = await getSFTPSession(sessionId, sessions);
            // 使用递归删除，支持删除非空目录
            await sftpManager.rmdirRecursive(remotePath);

            res.json({
                success: true,
                path: remotePath
            });
        } catch (err) {
            console.error('[SFTP API] 删除目录失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    /**
     * 删除文件
     * DELETE /api/sftp/:sessionId/unlink?path=/home/user/file.txt
     */
    router.delete('/:sessionId/unlink', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const remotePath = validatePath(req.query.path);

            const sftpManager = await getSFTPSession(sessionId, sessions);
            await sftpManager.unlink(remotePath);

            res.json({
                success: true,
                path: remotePath
            });
        } catch (err) {
            console.error('[SFTP API] 删除文件失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    /**
     * 批量删除文件/目录
     * POST /api/sftp/:sessionId/delete-batch
     * Body: { paths: ["/path1", "/path2"] }
     */
    router.post('/:sessionId/delete-batch', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { paths } = req.body;

            if (!Array.isArray(paths) || paths.length === 0) {
                throw new Error('paths 必须是非空数组');
            }

            const sftpManager = await getSFTPSession(sessionId, sessions);
            const results = [];

            for (const remotePath of paths) {
                try {
                    const validPath = validatePath(remotePath);
                    const stats = await sftpManager.stat(validPath);

                    if (stats.type === 'directory') {
                        // 使用递归删除支持非空目录
                        await sftpManager.rmdirRecursive(validPath);
                    } else {
                        await sftpManager.unlink(validPath);
                    }

                    results.push({ path: validPath, success: true });
                } catch (err) {
                    results.push({ path: remotePath, success: false, error: err.message });
                }
            }

            res.json({
                success: true,
                results
            });
        } catch (err) {
            console.error('[SFTP API] 批量删除失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    /**
     * 重命名文件/目录
     * POST /api/sftp/:sessionId/rename
     * Body: { oldPath: "/old", newPath: "/new" }
     */
    router.post('/:sessionId/rename', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const oldPath = validatePath(req.body.oldPath);
            const newPath = validatePath(req.body.newPath);

            const sftpManager = await getSFTPSession(sessionId, sessions);
            await sftpManager.rename(oldPath, newPath);

            res.json({
                success: true,
                oldPath,
                newPath
            });
        } catch (err) {
            console.error('[SFTP API] 重命名失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    // ===== 分片上传 =====

    /**
     * 初始化上传
     * POST /api/sftp/:sessionId/upload/init
     * Body: { filename, fileSize, remotePath, fileHash? }
     */
    router.post('/:sessionId/upload/init', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { filename, fileSize, remotePath, fileHash } = req.body;

            // 验证会话
            if (!sessions.has(sessionId)) {
                throw new Error('SSH 会话不存在');
            }

            const validPath = validatePath(remotePath);

            const result = uploadManager.initUpload(sessionId, {
                filename,
                fileSize,
                remotePath: validPath,
                fileHash
            });

            res.json({
                success: true,
                ...result
            });
        } catch (err) {
            console.error('[SFTP API] 初始化上传失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    /**
     * 上传分片
     * POST /api/sftp/:sessionId/upload/chunk
     * Body: raw binary data
     * Headers: X-Upload-Id, X-Chunk-Index
     */
    router.post('/:sessionId/upload/chunk', express.raw({ limit: '10mb', type: 'application/octet-stream' }), async (req, res) => {
        try {
            const uploadId = req.headers['x-upload-id'];
            const chunkIndex = parseInt(req.headers['x-chunk-index'], 10);

            if (!uploadId || isNaN(chunkIndex)) {
                throw new Error('缺少 X-Upload-Id 或 X-Chunk-Index 头');
            }

            // 确保 req.body 是 Buffer
            let data = req.body;
            if (!Buffer.isBuffer(data)) {
                if (data instanceof ArrayBuffer) {
                    data = Buffer.from(data);
                } else if (typeof data === 'object') {
                    // 如果是对象，可能是解析错误
                    throw new Error('无效的分片数据格式');
                }
            }

            const result = await uploadManager.uploadChunk(uploadId, chunkIndex, data);

            res.json({
                success: true,
                ...result
            });
        } catch (err) {
            console.error('[SFTP API] 上传分片失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    /**
     * 完成上传
     * POST /api/sftp/:sessionId/upload/complete
     * Body: { uploadId }
     */
    router.post('/:sessionId/upload/complete', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { uploadId } = req.body;

            const sftpManager = await getSFTPSession(sessionId, sessions);
            const result = await uploadManager.completeUpload(uploadId, sftpManager);

            res.json({
                success: true,
                ...result
            });
        } catch (err) {
            console.error('[SFTP API] 完成上传失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    /**
     * 获取上传状态
     * GET /api/sftp/:sessionId/upload/status?uploadId=xxx
     */
    router.get('/:sessionId/upload/status', async (req, res) => {
        try {
            const { uploadId } = req.query;

            const status = uploadManager.getUploadStatus(uploadId);
            if (!status) {
                throw new Error('上传任务不存在');
            }

            res.json({
                success: true,
                ...status
            });
        } catch (err) {
            console.error('[SFTP API] 获取上传状态失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    /**
     * 取消上传
     * POST /api/sftp/:sessionId/upload/cancel
     * Body: { uploadId }
     */
    router.post('/:sessionId/upload/cancel', async (req, res) => {
        try {
            const { uploadId } = req.body;

            uploadManager.cancelUpload(uploadId);

            res.json({
                success: true
            });
        } catch (err) {
            console.error('[SFTP API] 取消上传失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    // ===== 文件下载 =====

    /**
     * 下载单个文件
     * GET /api/sftp/:sessionId/download?path=/home/user/file.txt
     */
    router.get('/:sessionId/download', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const remotePath = validatePath(req.query.path);

            const sftpManager = await getSFTPSession(sessionId, sessions);

            // 获取文件信息
            const stats = await sftpManager.stat(remotePath);
            if (stats.type !== 'file') {
                throw new Error('只能下载文件');
            }

            const filename = path.basename(remotePath);

            // 设置响应头
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.setHeader('Content-Length', stats.size);

            // 创建读取流并管道到响应
            const readStream = sftpManager.createReadStream(remotePath);

            readStream.on('error', (err) => {
                console.error('[SFTP API] 下载文件失败:', err.message);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: err.message
                    });
                }
            });

            readStream.pipe(res);
        } catch (err) {
            console.error('[SFTP API] 下载文件失败:', err.message);
            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    });

    return router;
}

// 导出 SFTP 会话清理函数
export function cleanupSFTPSessions() {
    for (const [sessionId, sftpManager] of sftpSessions) {
        sftpManager.close();
    }
    sftpSessions.clear();
}
