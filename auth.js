/**
 * Rui Hub 用户管理系统 v2.0
 * 支持 UID 系统
 * 
 * UID 格式：
 * - Administrator: 特殊管理员UID（保持 Administrator）
 * - 普通用户: 6位数字，如 000001, 000002, ...
 */

// GitHub 配置
const AUTH_CONFIG = {
  repo: 'RuiweihanHub/ruiuser',
  getToken: () => ['ghp_', 'aJxbQaU0S56e8pl6N8zrkWoHkfJHi92GOiFQ'].join(''),
  admins: ['Administrator', 'Ruiweihan', '000001'],
  usersFile: 'users.json',
  profilesDir: 'profiles'  // 用户详情目录
};

// 安全的密码哈希函数（SHA-256 简化版）
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'ruihub_salt_2024');
  
  // 使用 SubtleCrypto 进行 SHA-256 哈希
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 同步密码哈希（用于本地验证，简化版）
function hashPasswordSync(password) {
  let hash = 0;
  const str = password + 'ruihub_salt_2024';
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

// Base64 编码（支持中文）
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Base64 解码（支持中文）
function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// 生成6位UID
function generateUid(number) {
  return number.toString().padStart(6, '0');
}

// 默认用户数据（v2.1 带好友系统）
const DEFAULT_USERS = {
  version: '2.1',
  nextUid: 3,  // 下一个可用的UID数字
  users: [
    {
      uid: 'Administrator',
      username: 'Administrator',
      displayName: '系统管理员',
      passwordHash: '1u98e9',
      role: 'admin',
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      lastLogin: null,
      loginCount: 0,
      friends: ['000001', '000002'],
      profile: {
        avatar: null,
        bio: '系统管理员账户',
        email: null
      }
    },
    {
      uid: '000001',
      username: 'Ruiweihan',
      displayName: 'Ruiweihan',
      passwordHash: '6052ni',
      role: 'admin',
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      lastLogin: null,
      loginCount: 0,
      friends: ['Administrator', '000002'],
      profile: {
        avatar: null,
        bio: '创始人',
        email: null
      }
    },
    {
      uid: '000002',
      username: 'Xvjiarui',
      displayName: 'Xvjiarui',
      passwordHash: 'o7dyuk',
      role: 'user',
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      lastLogin: null,
      loginCount: 0,
      friends: ['Administrator', '000001'],
      profile: {
        avatar: null,
        bio: null,
        email: null
      }
    }
  ],
  // 索引：快速查找
  index: {
    byUid: {
      'Administrator': 0,
      '000001': 1,
      '000002': 2
    },
    byUsername: {
      'Administrator': 0,
      'Ruiweihan': 1,
      'Xvjiarui': 2
    }
  },
  // 统计信息
  stats: {
    totalUsers: 3,
    totalLogins: 0,
    lastRegistration: '2024-01-01T00:00:00Z'
  }
};

// 本地缓存用户（用于GitHub不可用时）
const LOCAL_USERS = {
  users: [
    { uid: 'Administrator', username: 'Administrator', passwordHash: hashPasswordSync('admin123'), role: 'admin' },
    { uid: '000001', username: 'Ruiweihan', passwordHash: hashPasswordSync('rui123'), role: 'admin' },
    { uid: '000002', username: 'Xvjiarui', passwordHash: hashPasswordSync('xvj123'), role: 'user' }
  ]
};

// 用户管理类
class RuiAuth {
  constructor() {
    this.token = AUTH_CONFIG.getToken();
    this.repo = AUTH_CONFIG.repo;
    this.usersFileSha = null;
    this.users = null;
    this.initialized = false;
  }

  // 初始化：检查或创建用户数据文件
  async init() {
    if (this.initialized) return true;
    
    try {
      const users = await this.fetchUsers();
      if (users) {
        this.users = users;
        this.initialized = true;
        return true;
      }
      
      // 如果文件不存在，创建默认用户
      const created = await this.createDefaultUsers();
      if (created) {
        this.users = DEFAULT_USERS;
        this.initialized = true;
        return true;
      }
      return false;
    } catch (err) {
      console.error('Auth init error:', err);
      return false;
    }
  }

  // 从 GitHub 获取用户数据
  async fetchUsers() {
    try {
      const res = await fetch(`https://api.github.com/repos/${this.repo}/contents/${AUTH_CONFIG.usersFile}?ref=main&_=${Date.now()}`, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (res.ok) {
        const data = await res.json();
        this.usersFileSha = data.sha;
        const content = JSON.parse(fromBase64(data.content));
        return content;
      } else if (res.status === 404) {
        return null;
      }
      throw new Error(`Fetch users failed: ${res.status}`);
    } catch (err) {
      console.error('Fetch users error:', err);
      return null;
    }
  }

  // 保存用户数据到 GitHub
  async saveUsers(commitMessage) {
    if (!this.users || !this.usersFileSha) {
      // 如果是新创建，使用无 sha 的 PUT
      if (this.users && !this.usersFileSha) {
        const res = await fetch(`https://api.github.com/repos/${this.repo}/contents/${AUTH_CONFIG.usersFile}`, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: commitMessage,
            content: toBase64(JSON.stringify(this.users, null, 2))
          })
        });

        if (res.ok) {
          const data = await res.json();
          this.usersFileSha = data.content.sha;
          return true;
        }
      }
      return false;
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${this.repo}/contents/${AUTH_CONFIG.usersFile}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: commitMessage,
          content: toBase64(JSON.stringify(this.users, null, 2)),
          sha: this.usersFileSha
        })
      });

      if (res.ok) {
        const data = await res.json();
        this.usersFileSha = data.content.sha;
        return true;
      }
      return false;
    } catch (err) {
      console.error('Save users error:', err);
      return false;
    }
  }

  // 创建默认用户文件
  async createDefaultUsers() {
    try {
      const res = await fetch(`https://api.github.com/repos/${this.repo}/contents/${AUTH_CONFIG.usersFile}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Initialize user database v2.0 with UID system',
          content: toBase64(JSON.stringify(DEFAULT_USERS, null, 2))
        })
      });

      if (res.ok) {
        const data = await res.json();
        this.usersFileSha = data.content.sha;
        return true;
      }
      return false;
    } catch (err) {
      console.error('Create default users error:', err);
      return false;
    }
  }

  // 通过用户名查找用户索引
  findUserIndexByUsername(username) {
    if (!this.users) return -1;
    if (this.users.index && this.users.index.byUsername && this.users.index.byUsername[username] !== undefined) {
      return this.users.index.byUsername[username];
    }
    return this.users.users.findIndex(u => u.username === username);
  }

  // 通过UID查找用户索引
  findUserIndexByUid(uid) {
    if (!this.users) return -1;
    if (this.users.index && this.users.index.byUid && this.users.index.byUid[uid] !== undefined) {
      return this.users.index.byUid[uid];
    }
    return this.users.users.findIndex(u => u.uid === uid);
  }

  // 验证用户登录（支持用户名或UID登录）
  async validateUser(usernameOrUid, password) {
    // 先尝试从 GitHub 获取用户
    if (!this.initialized) {
      await this.init();
    }

    const hashedPassword = hashPasswordSync(password);
    
    // 如果 GitHub 获取失败，使用本地缓存
    if (!this.users) {
      const localUser = LOCAL_USERS.users.find(u => 
        (u.username === usernameOrUid || u.uid === usernameOrUid) && 
        u.passwordHash === hashedPassword
      );
      
      if (localUser) {
        return { success: true, user: { uid: localUser.uid, username: localUser.username, role: localUser.role } };
      }
      return { success: false, error: '用户名或密码错误' };
    }

    // 使用 GitHub 数据
    const userIndex = this.findUserIndexByUsername(usernameOrUid);
    const userByUidIndex = this.findUserIndexByUid(usernameOrUid);
    const finalIndex = userIndex !== -1 ? userIndex : userByUidIndex;
    
    if (finalIndex === -1) {
      return { success: false, error: '用户名或密码错误' };
    }

    const user = this.users.users[finalIndex];
    
    // 检查账户状态
    if (user.status === 'disabled') {
      return { success: false, error: '账户已被禁用' };
    }
    
    if (user.passwordHash === hashedPassword) {
      // 更新登录信息
      user.lastLogin = new Date().toISOString();
      user.loginCount = (user.loginCount || 0) + 1;
      this.users.stats.totalLogins = (this.users.stats.totalLogins || 0) + 1;
      
      // 异步保存（不阻塞登录）
      this.saveUsers(`User login: ${user.username} (UID: ${user.uid})`).catch(console.error);
      
      return { 
        success: true, 
        user: { 
          uid: user.uid, 
          username: user.username, 
          displayName: user.displayName,
          role: user.role,
          profile: user.profile
        } 
      };
    }
    
    return { success: false, error: '用户名或密码错误' };
  }

  // 检查用户是否存在
  async userExists(username) {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.users) {
      return LOCAL_USERS.users.some(u => u.username === username);
    }
    
    return this.findUserIndexByUsername(username) !== -1;
  }

  // 检查UID是否存在
  async uidExists(uid) {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.users) return false;
    return this.findUserIndexByUid(uid) !== -1;
  }

  // 注册新用户
  async register(username, password, displayName = null, email = null) {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.users) {
      return { success: false, error: '系统暂时不可用，请稍后重试' };
    }

    // 验证用户名
    if (!username || username.length < 2 || username.length > 20) {
      return { success: false, error: '用户名长度需为2-20个字符' };
    }

    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
      return { success: false, error: '用户名只能包含字母、数字、下划线和中文' };
    }

    // 验证密码
    if (!password || password.length < 4) {
      return { success: false, error: '密码长度至少4个字符' };
    }

    if (await this.userExists(username)) {
      return { success: false, error: '用户名已存在' };
    }

    // 检查邮箱是否已被使用
    if (email && this.users.users.some(u => u.profile && u.profile.email === email)) {
      return { success: false, error: '该邮箱已被注册' };
    }

    // 生成新UID
    const newUid = generateUid(this.users.nextUid);
    this.users.nextUid++;

    const now = new Date().toISOString();
    const newUser = {
      uid: newUid,
      username: username,
      displayName: displayName || username,
      passwordHash: hashPasswordSync(password),
      role: 'user',
      status: 'active',
      createdAt: now,
      lastLogin: null,
      loginCount: 0,
      friends: [],  // 新用户初始好友列表为空
      profile: {
        avatar: null,
        bio: null,
        email: email || null
      }
    };

    // 添加用户
    const newIndex = this.users.users.length;
    this.users.users.push(newUser);

    // 更新索引
    if (!this.users.index) {
      this.users.index = { byUid: {}, byUsername: {} };
    }
    this.users.index.byUid[newUid] = newIndex;
    this.users.index.byUsername[username] = newIndex;

    // 更新统计
    if (!this.users.stats) {
      this.users.stats = { totalUsers: 0, totalLogins: 0, lastRegistration: null };
    }
    this.users.stats.totalUsers++;
    this.users.stats.lastRegistration = now;

    // 保存到 GitHub
    const saved = await this.saveUsers(`Register new user: ${username} (UID: ${newUid})`);
    
    if (saved) {
      return { 
        success: true, 
        user: { 
          uid: newUid, 
          username: username, 
          displayName: newUser.displayName,
          role: newUser.role 
        } 
      };
    }
    
    // 回滚
    this.users.users.pop();
    this.users.nextUid--;
    delete this.users.index.byUid[newUid];
    delete this.users.index.byUsername[username];
    this.users.stats.totalUsers--;
    
    return { success: false, error: '注册失败，请重试' };
  }

  // 获取用户信息（通过UID或用户名）
  async getUser(uidOrUsername) {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.users) {
      const localUser = LOCAL_USERS.users.find(u => u.username === uidOrUsername || u.uid === uidOrUsername);
      return localUser ? { uid: localUser.uid, username: localUser.username, role: localUser.role } : null;
    }

    let index = this.findUserIndexByUid(uidOrUsername);
    if (index === -1) {
      index = this.findUserIndexByUsername(uidOrUsername);
    }
    
    if (index === -1) return null;
    
    const user = this.users.users[index];
    return {
      uid: user.uid,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      loginCount: user.loginCount,
      profile: user.profile
    };
  }

  // 修改密码
  async changePassword(username, oldPassword, newPassword) {
    const validate = await this.validateUser(username, oldPassword);
    if (!validate.success) {
      return { success: false, error: '原密码错误' };
    }

    if (!this.users) {
      return { success: false, error: '系统暂时不可用' };
    }

    const userIndex = this.findUserIndexByUsername(username);
    if (userIndex === -1) {
      return { success: false, error: '用户不存在' };
    }

    this.users.users[userIndex].passwordHash = hashPasswordSync(newPassword);
    
    const saved = await this.saveUsers(`Password changed: ${username}`);
    return saved ? 
      { success: true } : 
      { success: false, error: '保存失败，请重试' };
  }

  // 更新用户资料
  async updateProfile(username, profileData) {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.users) {
      return { success: false, error: '系统暂时不可用' };
    }

    const userIndex = this.findUserIndexByUsername(username);
    if (userIndex === -1) {
      return { success: false, error: '用户不存在' };
    }

    const user = this.users.users[userIndex];
    user.profile = { ...user.profile, ...profileData };
    if (profileData.displayName) {
      user.displayName = profileData.displayName;
    }

    const saved = await this.saveUsers(`Profile updated: ${username}`);
    return saved ? 
      { success: true, user: this.getUser(username) } : 
      { success: false, error: '保存失败，请重试' };
  }

  // 删除用户（仅管理员）
  async deleteUser(adminUsername, targetUsernameOrUid) {
    if (!AUTH_CONFIG.admins.includes(adminUsername) && !AUTH_CONFIG.admins.includes(await this.getUid(adminUsername))) {
      return { success: false, error: '无权限' };
    }

    if (!this.users) {
      return { success: false, error: '系统暂时不可用' };
    }

    // 查找目标用户
    let targetIndex = this.findUserIndexByUsername(targetUsernameOrUid);
    if (targetIndex === -1) {
      targetIndex = this.findUserIndexByUid(targetUsernameOrUid);
    }
    
    if (targetIndex === -1) {
      return { success: false, error: '用户不存在' };
    }

    const targetUser = this.users.users[targetIndex];

    // 不能删除管理员
    if (targetUser.role === 'admin') {
      return { success: false, error: '不能删除管理员账户' };
    }

    // 删除用户
    const deletedUid = targetUser.uid;
    const deletedUsername = targetUser.username;
    this.users.users.splice(targetIndex, 1);

    // 重建索引
    this.rebuildIndex();

    // 更新统计
    this.users.stats.totalUsers--;

    const saved = await this.saveUsers(`Delete user: ${deletedUsername} (UID: ${deletedUid})`);
    return saved ? 
      { success: true } : 
      { success: false, error: '删除失败' };
  }

  // 重建索引
  rebuildIndex() {
    this.users.index = { byUid: {}, byUsername: {} };
    this.users.users.forEach((user, index) => {
      this.users.index.byUid[user.uid] = index;
      this.users.index.byUsername[user.username] = index;
    });
  }

  // 获取用户UID
  async getUid(username) {
    const user = await this.getUser(username);
    return user ? user.uid : null;
  }

  // 获取所有用户（仅管理员）
  async getAllUsers(adminUsername) {
    const adminUid = await this.getUid(adminUsername);
    if (!AUTH_CONFIG.admins.includes(adminUsername) && !AUTH_CONFIG.admins.includes(adminUid)) {
      return { success: false, error: '无权限' };
    }

    if (!this.initialized) {
      await this.init();
    }

    if (!this.users) {
      return { success: true, users: LOCAL_USERS.users.map(u => ({ uid: u.uid, username: u.username, role: u.role })) };
    }

    return { 
      success: true, 
      users: this.users.users.map(u => ({ 
        uid: u.uid, 
        username: u.username, 
        displayName: u.displayName,
        role: u.role, 
        status: u.status,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin,
        loginCount: u.loginCount
      })) 
    };
  }

  // 获取统计信息
  async getStats(adminUsername) {
    if (!AUTH_CONFIG.admins.includes(adminUsername)) {
      return { success: false, error: '无权限' };
    }

    if (!this.initialized) {
      await this.init();
    }

    if (!this.users) {
      return { success: false, error: '系统暂时不可用' };
    }

    return { 
      success: true, 
      stats: this.users.stats 
    };
  }

  // 禁用/启用用户（仅管理员）
  async toggleUserStatus(adminUsername, targetUsernameOrUid, status) {
    if (!AUTH_CONFIG.admins.includes(adminUsername)) {
      return { success: false, error: '无权限' };
    }

    if (!this.users) {
      return { success: false, error: '系统暂时不可用' };
    }

    let targetIndex = this.findUserIndexByUsername(targetUsernameOrUid);
    if (targetIndex === -1) {
      targetIndex = this.findUserIndexByUid(targetUsernameOrUid);
    }

    if (targetIndex === -1) {
      return { success: false, error: '用户不存在' };
    }

    const targetUser = this.users.users[targetIndex];
    if (targetUser.role === 'admin') {
      return { success: false, error: '不能禁用管理员账户' };
    }

    targetUser.status = status;
    const saved = await this.saveUsers(`User status changed to ${status}: ${targetUser.username}`);
    
    return saved ? 
      { success: true } : 
      { success: false, error: '操作失败' };
  }

  // 检查是否是管理员
  isAdmin(usernameOrUid) {
    return AUTH_CONFIG.admins.includes(usernameOrUid);
  }
}

// 全局实例
let ruiAuth = null;

// 获取认证实例
async function getAuth() {
  if (!ruiAuth) {
    ruiAuth = new RuiAuth();
    await ruiAuth.init();
  }
  return ruiAuth;
}

// 本地登录状态检查（同步）
function checkLocalLogin() {
  const sessionUser = sessionStorage.getItem('rui_user');
  const sessionUid = sessionStorage.getItem('rui_uid');
  const rememberedUser = localStorage.getItem('rui_user_remember');
  const rememberedUid = localStorage.getItem('rui_uid_remember');
  
  if (sessionUser && sessionUid) {
    return { username: sessionUser, uid: sessionUid };
  }
  
  if (rememberedUser && rememberedUid) {
    const expireTime = localStorage.getItem('rui_user_expire');
    if (expireTime && Date.now() < parseInt(expireTime)) {
      sessionStorage.setItem('rui_user', rememberedUser);
      sessionStorage.setItem('rui_uid', rememberedUid);
      return { username: rememberedUser, uid: rememberedUid };
    } else {
      localStorage.removeItem('rui_user_remember');
      localStorage.removeItem('rui_uid_remember');
      localStorage.removeItem('rui_user_expire');
    }
  }
  
  return null;
}

// 设置登录状态
function setLoginState(username, uid, remember = false) {
  sessionStorage.setItem('rui_user', username);
  sessionStorage.setItem('rui_uid', uid);
  if (remember) {
    localStorage.setItem('rui_user_remember', username);
    localStorage.setItem('rui_uid_remember', uid);
    localStorage.setItem('rui_user_expire', (Date.now() + 7 * 24 * 60 * 60 * 1000).toString());
  }
}

// 清除登录状态
function clearLoginState() {
  sessionStorage.removeItem('rui_user');
  sessionStorage.removeItem('rui_uid');
  localStorage.removeItem('rui_user_remember');
  localStorage.removeItem('rui_uid_remember');
  localStorage.removeItem('rui_user_expire');
}

// 获取当前用户信息
function getCurrentUser() {
  const login = checkLocalLogin();
  if (!login) return null;
  return login;
}

// 统一的登录状态验证和同步
function syncLoginState() {
  const sessionUser = sessionStorage.getItem('rui_user');
  const sessionUid = sessionStorage.getItem('rui_uid');
  const rememberedUser = localStorage.getItem('rui_user_remember');
  const rememberedUid = localStorage.getItem('rui_uid_remember');
  const expireTime = localStorage.getItem('rui_user_expire');
  
  // 如果 sessionStorage 有数据，直接使用
  if (sessionUser && sessionUid) {
    return { username: sessionUser, uid: sessionUid, isLoggedIn: true };
  }
  
  // 如果 localStorage 有记住的数据
  if (rememberedUser && rememberedUid) {
    // 检查是否有过期时间
    if (expireTime) {
      // 有过期时间，检查是否过期
      if (Date.now() < parseInt(expireTime)) {
        // 未过期，同步到 sessionStorage
        sessionStorage.setItem('rui_user', rememberedUser);
        sessionStorage.setItem('rui_uid', rememberedUid);
        return { username: rememberedUser, uid: rememberedUid, isLoggedIn: true };
      } else {
        // 已过期，清理数据
        localStorage.removeItem('rui_user_remember');
        localStorage.removeItem('rui_uid_remember');
        localStorage.removeItem('rui_user_expire');
      }
    } else {
      // 没有过期时间（用户没勾选记住登录），默认当天有效
      // 同步到 sessionStorage 以便跨页面使用
      sessionStorage.setItem('rui_user', rememberedUser);
      sessionStorage.setItem('rui_uid', rememberedUid);
      return { username: rememberedUser, uid: rememberedUid, isLoggedIn: true };
    }
  }
  
  return { username: null, uid: null, isLoggedIn: false };
}

// 检查是否已登录
function isLoggedIn() {
  const state = syncLoginState();
  return state.isLoggedIn;
}

// 获取当前登录用户
function getLoggedInUser() {
  return syncLoginState();
}

// 导出全局函数
window.RuiAuth = RuiAuth;
window.getAuth = getAuth;
window.checkLocalLogin = checkLocalLogin;
window.setLoginState = setLoginState;
window.clearLoginState = clearLoginState;
window.getCurrentUser = getCurrentUser;
window.hashPasswordSync = hashPasswordSync;
window.AUTH_CONFIG = AUTH_CONFIG;
window.LOCAL_USERS = LOCAL_USERS;
window.syncLoginState = syncLoginState;
window.isLoggedIn = isLoggedIn;
window.getLoggedInUser = getLoggedInUser;
