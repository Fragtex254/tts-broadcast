const INTERNAL_ERROR_MESSAGE = '服务器内部错误，请稍后重试';

/**
 * 未预期的服务端错误只返回稳定的公共文案；具体异常必须由调用方写入服务端日志。
 * @param {import('express').Response} res - Express response
 * @returns {import('express').Response} Express response
 */
function sendInternalError(res) {
  return res.status(500).json({ error: INTERNAL_ERROR_MESSAGE });
}

module.exports = { INTERNAL_ERROR_MESSAGE, sendInternalError };
