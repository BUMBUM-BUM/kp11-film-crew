/**
 * ==============================================================================
 * ГАПОУ КП11 // DROPBOX CLOUD AVATAR STORAGE CLIENT
 * ==============================================================================
 * Позволяет:
 * 1. Загружать файлы аватарок напрямую в облако Dropbox в папку /kp11_avatars/
 * 2. Генерировать постоянную публичную прямую ссылку (dl.dropboxusercontent.com...&raw=1)
 * 3. Обеспечивать бесшовный fallback на локальный сервер при временных сбоях сети
 * ==============================================================================
 */

const https = require('https');
const path = require('path');

const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN || 'sl.u.AG2-Z2sRX2XHypvgjEJHlPvWCZUW4tqw17s2wQ0gOHNK6mEeigtMZyZ-_wVxUhV8tDUANqHAEuOA4xl15jv1OxsVCmCLm6SO8Y9E_cO8UCxWphYSydQeOY-kuBLNPqk6cj9KutoOQSvg5F5yzR-skscEhDDWer71iFD7ZeKBGPdVLg1sM33Rst3r4cBtBE29VBzR1wbMBlEDI_i2aR9Z_B4qEEQ69i9tyOjvfhjnMgeLO5u8y1gkxCA46sVeagM32kTbwAv_ZRiit1uVR_a9Y64UL2cr9nemjggFrdqVN8mqFMhTi0FqcTKWVRACaEZ5lKhfYt7bwd4mRkSAZeJA8t-Lvy8hULP2Vcoa_pu0E61-fac7z46SPzcNgoAxXogiCFMxMDFY9QJfU6tzkIAUBjq0cbsbq-MEP-Pfho3PYegVgJDsvNc5Msh6-6WGN-GjZU-ebp2V-EWq4M69vikx9kxOggnQ3X-g5Gc28Ccb9NW-G9u9Br8DS9EFP9sJ59MR1P3XtijbYvIYyfx4PMelXXJG3aYkOznYLAIqOCEqgdG_xrkDGF5e7ISuv6mAMrahXKWoFsrA5hudC2xH_9SPv3t9zM23ZFb0_3JKrfD8yD7NQQEoV0JgulcSvRvg4721gLQh4vxussXL0Tf75osYpmVzXTZfdScOEIwITRYA6ULJPgElxHgxfcQgXOah_ohO5T1yiPQ1iT8OaEatHvquIAJ6W_Rw0-pmMwUOK6p6BhLwE6NK_7cooh8D_LzJ1GpOa-ItSUXvo80s9xWEGnXNVcacBSdybxmfZXwB5Rg1b6Or2TMgkHqfzZZ5OtO44dpWwN0ZALCwGqdxSDU7ZFdV-kkL9gI4CG9pXems62s_e_nxMGKa0GZljdPPYS5KCOfAIK9iQPmR1kNwmmH_rFEh23jC77xY7pHHQb_V7M7BgMa3h_6DY5gOiyudy-eS1lhzpAMyA0AUkBi0AVhg_WtvYyg2EFTqO_kUGPRikL7m7RhAKD8j0wIMOLiYLVOQv4WS4XNroT2oWjVr5j62zg_R_MHguzT3QdBYkjt80Z8P7n59PtCIVx5pfobFlVSFqkIH3s4esk8mhEHMIA8I8AuV_khzhQHR9HeS6fSB9XZYf2BtE9aDW4yb_wdM6MDv1GsGL6qjuSGH1gqg9IqQFvCWU-eYT2KjDceuHGe2A5R6f_HT_8GeuD6tCu-4wPV3P156igrEzb8gIKJ4g7pvsP1tX7TI8qV2kamXn2EHXrmgjwtjdDMAXtpSK1dPKdnraY1O_kb6ntmX7J10L5WLpA62bOzTKmjMu3RQYXQJo-bw5y-34om--v11YTHgKv9da3ImKKbI-NvpUW3OGmp6VlNX8VIclhoIWYHkGYVUoe8zUVHdJCo_89UN5V_UGjdL1RMliJX_mGz0iRlH3xMjaq28jXUoLaLzfvwmpH0rD7Yg9CJm1A';
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY || '5ghj2kc6u4mxa45';
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET || '5hmhb30297yvs6b';

/**
 * Загрузка бинарного буфера изображения в Dropbox
 */
async function uploadToDropbox(dropboxPath, buffer) {
  return new Promise((resolve, reject) => {
    try {
      const dropboxArgs = JSON.stringify({
        path: dropboxPath,
        mode: 'overwrite',
        autorename: false,
        mute: true
      });

      const req = https.request('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + DROPBOX_ACCESS_TOKEN,
          'Dropbox-API-Arg': dropboxArgs,
          'Content-Type': 'application/octet-stream',
          'Content-Length': buffer.length
        },
        timeout: 15000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`Dropbox Upload HTTP ${res.statusCode}: ${body}`));
            }
          } catch (e) {
            reject(new Error(`Dropbox Upload Parse Error: ${body}`));
          }
        });
      });

      req.on('error', err => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Dropbox Upload Timeout'));
      });

      req.write(buffer);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Создание или получение публичной ссылки для доступа к файлу
 */
async function getOrCreateSharedLink(dropboxPath) {
  return new Promise((resolve) => {
    try {
      const req = https.request('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + DROPBOX_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data && data.url) {
              return resolve(data.url);
            }

            // Если ссылка уже существует (shared_link_already_exists)
            if (data && data.error && data.error['.tag'] === 'shared_link_already_exists') {
              return getExistingSharedLink(dropboxPath).then(resolve);
            }

            resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.write(JSON.stringify({ path: dropboxPath }));
      req.end();
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Получение уже созданной ссылки
 */
async function getExistingSharedLink(dropboxPath) {
  return new Promise((resolve) => {
    try {
      const req = https.request('https://api.dropboxapi.com/2/sharing/list_shared_links', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + DROPBOX_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data && Array.isArray(data.links) && data.links.length > 0) {
              return resolve(data.links[0].url);
            }
            resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.write(JSON.stringify({ path: dropboxPath, direct_only: true }));
      req.end();
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Главный метод загрузки аватарки в Dropbox с получением прямой графической ссылки
 */
async function uploadAvatarBuffer(userId, buffer, ext = 'jpg') {
  try {
    const cleanUserId = String(userId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `avatar_${cleanUserId}_${Date.now()}.${ext}`;
    const dropboxPath = `/kp11_avatars/${fileName}`;

    await uploadToDropbox(dropboxPath, buffer);
    const sharedUrl = await getOrCreateSharedLink(dropboxPath);

    if (sharedUrl) {
      let directUrl = sharedUrl.replace(/www\.dropbox\.com/i, 'dl.dropboxusercontent.com');
      directUrl = directUrl.replace(/([?&])dl=[01]/gi, '$1raw=1');
      if (!directUrl.includes('raw=1')) {
        directUrl += (directUrl.includes('?') ? '&' : '?') + 'raw=1';
      }
      return directUrl;
    }
    return null;
  } catch (err) {
    console.error('[Dropbox Client Error]:', err.message);
    return null;
  }
}

module.exports = {
  uploadAvatarBuffer,
  uploadToDropbox,
  getOrCreateSharedLink
};
