#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { z } from 'zod';
import { setLanguage, t } from './i18n.js';

// Habitica API 基础配置
const HABITICA_API_BASE = 'https://habitica.com/api/v3';

// 验证环境变量
const HABITICA_USER_ID = process.env.HABITICA_USER_ID;
const HABITICA_API_TOKEN = process.env.HABITICA_API_TOKEN;

// Detect language (default EN)
setLanguage(process.env.MCP_LANG || process.env.LANG || 'en');

if (!HABITICA_USER_ID || !HABITICA_API_TOKEN) {
  console.error(t('Error: Please set HABITICA_USER_ID and HABITICA_API_TOKEN environment variables', '错误: 请设置 HABITICA_USER_ID 和 HABITICA_API_TOKEN 环境变量', 'エラー: HABITICA_USER_ID と HABITICA_API_TOKEN 環境変数を設定してください'));
  process.exit(1);
}

// 创建 Habitica API 客户端
const habiticaClient = axios.create({
  baseURL: HABITICA_API_BASE,
  headers: {
    'x-api-user': HABITICA_USER_ID,
    'x-api-key': HABITICA_API_TOKEN,
    'x-client': `${HABITICA_USER_ID}-habitica-mcp-server`,
    'Content-Type': 'application/json',
  },
});

// 创建 MCP 服务器
const server = new Server(
  {
    name: 'habitica-mcp-server',
    version: '0.0.2',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 工具定义
const tools = [
  {
    name: 'get_user_profile',
    description: t('Get user profile', '获取用户档案信息', 'ユーザー情報を取得'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_tasks',
    description: t('Get tasks list', '获取任务列表', 'タスク一覧を取得'),
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['habits', 'dailys', 'todos', 'rewards'],
          description: t('Task type', '任务类型', 'タスクタイプ'),
        },
      },
    },
  },
  {
    name: 'create_task',
    description: t('Create new task', '创建新任务', '新規タスクを作成'),
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['habit', 'daily', 'todo', 'reward'],
          description: t('Task type', '任务类型', 'タスクタイプ'),
        },
        text: {
          type: 'string',
          description: t('Task title', '任务标题', 'タスク名'),
        },
        notes: {
          type: 'string',
          description: t('Task notes', '任务备注', 'タスクメモ'),
        },
        difficulty: {
          type: 'number',
          enum: [0.1, 1, 1.5, 2],
          description: t('Difficulty (0.1=easy, 1=medium, 1.5=hard, 2=very hard)', '难度 (0.1=简单, 1=中等, 1.5=困难, 2=极难)', '難易度 (0.1=簡単, 1=普通, 1.5=難しい, 2=非常に難しい)'),
        },
        priority: {
          type: 'number',
          enum: [0.1, 1, 1.5, 2],
          description: t('Priority (0.1=low, 1=med, 1.5=high, 2=urgent)', '优先级 (0.1=低, 1=中, 1.5=高, 2=极高)', '優先度 (0.1=低, 1=中, 1.5=高, 2=緊急)'),
        },
        checklist: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: t('Checklist item text', '清单项目文本', 'チェックリスト項目'),
              },
              completed: {
                type: 'boolean',
                description: t('Completed status', '完成状态', '完了状態'),
                default: false,
              },
            },
            required: ['text'],
          },
          description: t('Checklist items', '清单项目', 'チェックリスト'),
        },
      },
      required: ['type', 'text'],
    },
  },
  {
    name: 'score_task',
    description: t('Score task / habit', '完成任务或记录习惯', 'タスク完了/習慣スコア'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID', 'タスクID'),
        },
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: t('Direction (up=positive, down=negative, habits only)', '方向 (up=正向, down=负向，仅适用于习惯)', '方向 (up=プラス, down=マイナス, 習慣のみ)'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'update_task',
    description: t('Update task', '更新任务', 'タスクを更新'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID', 'タスクID'),
        },
        text: {
          type: 'string',
          description: t('Task title', '任务标题', 'タスク名'),
        },
        notes: {
          type: 'string',
          description: t('Task notes', '任务备注', 'タスクメモ'),
        },
        completed: {
          type: 'boolean',
          description: t('Completed flag', '是否完成', '完了フラグ'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'delete_task',
    description: t('Delete task', '删除任务', 'タスクを削除'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID', 'タスクID'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'get_stats',
    description: t('Get user stats', '获取用户统计信息', 'ユーザー統計を取得'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'buy_reward',
    description: t('Buy reward', '购买奖励', '報酬を購入'),
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: t('Reward key or ID', '奖励的key或ID', '報酬のキーまたはID'),
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'get_inventory',
    description: t('Get inventory', '获取物品清单', 'インベントリを取得'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cast_spell',
    description: t('Cast spell', '施放技能', 'スキルを使用'),
    inputSchema: {
      type: 'object',
      properties: {
        spellId: {
          type: 'string',
          description: t('Spell ID', '技能ID', 'スキルID'),
        },
        targetId: {
          type: 'string',
          description: t('Target ID (optional)', '目标ID (可选)', 'ターゲットID（任意）'),
        },
      },
      required: ['spellId'],
    },
  },
  {
    name: 'get_tags',
    description: t('Get tags list', '获取标签列表', 'タグ一覧を取得'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_tag',
    description: t('Create tag', '创建新标签', 'タグを作成'),
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: t('Tag name', '标签名称', 'タグ名'),
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_pets',
    description: t('Get pets list', '获取宠物列表', 'ペット一覧を取得'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'feed_pet',
    description: t('Feed pet', '喂养宠物', 'ペットに餌を与える'),
    inputSchema: {
      type: 'object',
      properties: {
        pet: {
          type: 'string',
          description: t('Pet key', '宠物key', 'ペットキー'),
        },
        food: {
          type: 'string',
          description: t('Food key', '食物key', 'フードキー'),
        },
      },
      required: ['pet', 'food'],
    },
  },
  {
    name: 'hatch_pet',
    description: t('Hatch pet', '孵化宠物', 'ペットを孵化'),
    inputSchema: {
      type: 'object',
      properties: {
        egg: {
          type: 'string',
          description: t('Egg key', '蛋的key', '卵キー'),
        },
        hatchingPotion: {
          type: 'string',
          description: t('Hatching potion key', '孵化药水的key', '孵化ポーションキー'),
        },
      },
      required: ['egg', 'hatchingPotion'],
    },
  },
  {
    name: 'get_mounts',
    description: t('Get mounts list', '获取坐骑列表', 'マウント一覧を取得'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'equip_item',
    description: t('Equip item', '装备物品', 'アイテムを装備'),
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['mount', 'pet', 'costume', 'equipped'],
          description: t('Equipment type', '装备类型', '装備タイプ'),
        },
        key: {
          type: 'string',
          description: t('Item key', '物品key', 'アイテムキー'),
        },
      },
      required: ['type', 'key'],
    },
  },
  {
    name: 'get_notifications',
    description: t('Get notifications', '获取通知列表', '通知一覧を取得'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_notification',
    description: t('Mark notification as read', '标记通知为已读', '通知を既読にする'),
    inputSchema: {
      type: 'object',
      properties: {
        notificationId: {
          type: 'string',
          description: t('Notification ID', '通知ID', '通知ID'),
        },
      },
      required: ['notificationId'],
    },
  },
  {
    name: 'get_shop',
    description: t('Get shop items', '获取商店物品', 'ショップアイテムを取得'),
    inputSchema: {
      type: 'object',
      properties: {
        shopType: {
          type: 'string',
          enum: ['market', 'questShop', 'timeTravelersShop', 'seasonalShop'],
          description: t('Shop type', '商店类型', 'ショップタイプ'),
        },
      },
    },
  },
  {
    name: 'buy_item',
    description: t('Buy shop item', '购买商店物品', 'ショップアイテムを購入'),
    inputSchema: {
      type: 'object',
      properties: {
        itemKey: {
          type: 'string',
          description: t('Item key', '物品key', 'アイテムキー'),
        },
        quantity: {
          type: 'number',
          description: t('Quantity', '购买数量', '数量'),
          default: 1,
        },
      },
      required: ['itemKey'],
    },
  },
  {
    name: 'add_checklist_item',
    description: t('Add checklist item to task', '向任务添加清单项目', 'タスクにチェックリスト項目を追加'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID', 'タスクID'),
        },
        text: {
          type: 'string',
          description: t('Checklist item text', '清单项目文本', 'チェックリスト項目'),
        },
      },
      required: ['taskId', 'text'],
    },
  },
  {
    name: 'update_checklist_item',
    description: t('Update checklist item', '更新清单项目', 'チェックリスト項目を更新'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID', 'タスクID'),
        },
        itemId: {
          type: 'string',
          description: t('Checklist item ID', '清单项目ID', 'チェックリスト項目ID'),
        },
        text: {
          type: 'string',
          description: t('Checklist item text', '清单项目文本', 'チェックリスト項目'),
        },
        completed: {
          type: 'boolean',
          description: t('Completed status', '完成状态', '完了状態'),
        },
      },
      required: ['taskId', 'itemId'],
    },
  },
  {
    name: 'delete_checklist_item',
    description: t('Delete checklist item', '删除清单项目', 'チェックリスト項目を削除'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID', 'タスクID'),
        },
        itemId: {
          type: 'string',
          description: t('Checklist item ID', '清单项目ID', 'チェックリスト項目ID'),
        },
      },
      required: ['taskId', 'itemId'],
    },
  },
  {
    name: 'get_task_checklist',
    description: t('Get task checklist items', '获取任务清单项目', 'タスクのチェックリストを取得'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID', 'タスクID'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'score_checklist_item',
    description: t('Score checklist item (mark complete/incomplete)', '为清单项目评分（标记完成/未完成）', 'チェックリスト項目を完了/未完了に'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID', 'タスクID'),
        },
        itemId: {
          type: 'string',
          description: t('Checklist item ID', '清单项目ID', 'チェックリスト項目ID'),
        },
      },
      required: ['taskId', 'itemId'],
    },
  },
];

// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools,
  };
});

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_user_profile':
        return await getUserProfile();
      
      case 'get_tasks':
        return await getTasks(args.type);
      
      case 'create_task':
        return await createTask(args);
      
      case 'score_task':
        return await scoreTask(args.taskId, args.direction);
      
      case 'update_task':
        return await updateTask(args.taskId, args);
      
      case 'delete_task':
        return await deleteTask(args.taskId);
      
      case 'get_stats':
        return await getStats();
      
      case 'buy_reward':
        return await buyReward(args.key);
      
      case 'get_inventory':
        return await getInventory();
      
      case 'cast_spell':
        return await castSpell(args.spellId, args.targetId);
      
      case 'get_tags':
        return await getTags();
      
      case 'create_tag':
        return await createTag(args.name);
      
      case 'get_pets':
        return await getPets();
      
      case 'feed_pet':
        return await feedPet(args.pet, args.food);
      
      case 'hatch_pet':
        return await hatchPet(args.egg, args.hatchingPotion);
      
      case 'get_mounts':
        return await getMounts();
      
      case 'equip_item':
        return await equipItem(args.type, args.key);
      
      case 'get_notifications':
        return await getNotifications();
      
      case 'read_notification':
        return await readNotification(args.notificationId);
      
      case 'get_shop':
        return await getShop(args.shopType);
      
      case 'buy_item':
        return await buyItem(args.itemKey, args.quantity);
      
      case 'get_task_checklist':
        return await getTaskChecklist(args.taskId);
      
      case 'add_checklist_item':
        return await addChecklistItem(args.taskId, args.text);
      
      case 'update_checklist_item':
        return await updateChecklistItem(args.taskId, args.itemId, args);
      
      case 'delete_checklist_item':
        return await deleteChecklistItem(args.taskId, args.itemId);
      
      case 'score_checklist_item':
        return await scoreChecklistItem(args.taskId, args.itemId);
      
      default:
        throw new McpError(ErrorCode.MethodNotFound, t(`Unknown tool: ${name}`, `未知工具: ${name}`, `不明なツール: ${name}`));
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    
    const errorMessage = error.response?.data?.message || error.message || t('Unknown error', '未知错误', '不明なエラー');
    throw new McpError(ErrorCode.InternalError, t(`Habitica API error: ${errorMessage}`, `Habitica API 错误: ${errorMessage}`, `Habitica APIエラー: ${errorMessage}`));
  }
});

// 工具实现函数
async function getUserProfile() {
  const response = await habiticaClient.get('/user');
  const user = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(user, null, 2),
      },
    ],
  };
}

async function getTasks(type) {
  const endpoint = type ? `/tasks/user?type=${type}` : '/tasks/user';
  const response = await habiticaClient.get(endpoint);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

async function createTask(taskData) {
  const response = await habiticaClient.post('/tasks/user', taskData);
  const task = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Task created: ${task.text} (ID: ${task.id})`, `成功创建任务: ${task.text} (ID: ${task.id})`, `タスク作成成功: ${task.text} (ID: ${task.id})`),
      },
    ],
  };
}

async function scoreTask(taskId, direction = 'up') {
  const response = await habiticaClient.post(`/tasks/${taskId}/score/${direction}`);
  const result = response.data.data;
  
  let message = t('Task completed! ', '任务完成! ', 'タスク完了！ ');
  if (result.exp) message += t(`+${result.exp} XP `, `获得 ${result.exp} 经验值 `, `+${result.exp} XP `);
  if (result.gp) message += t(`+${result.gp} Gold `, `获得 ${result.gp} 金币 `, `+${result.gp} Gold `);
  if (result.lvl) message += t(`Level up to ${result.lvl}! `, `升级到 ${result.lvl} 级! `, `レベル${result.lvl}にアップ！ `);
  
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  };
}

async function updateTask(taskId, updates) {
  const response = await habiticaClient.put(`/tasks/${taskId}`, updates);
  const task = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Task updated: ${task.text}`, `成功更新任务: ${task.text}`, `タスク更新成功: ${task.text}`),
      },
    ],
  };
}

async function deleteTask(taskId) {
  await habiticaClient.delete(`/tasks/${taskId}`);
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Task deleted (ID: ${taskId})`, `成功删除任务 (ID: ${taskId})`, `タスク削除成功 (ID: ${taskId})`),
      },
    ],
  };
}

async function getStats() {
  const response = await habiticaClient.get('/user');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data.data.stats, null, 2),
      },
    ],
  };
}

async function buyReward(key) {
  const response = await habiticaClient.post(`/user/buy/${key}`);
  const result = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Reward purchased! Remaining Gold: ${result.gp}`, `成功购买奖励! 剩余金币: ${result.gp}`, `報酬購入成功！ 残りGold: ${result.gp}`),
      },
    ],
  };
}

async function getInventory() {
  const response = await habiticaClient.get('/user');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data.data.items, null, 2),
      },
    ],
  };
}

async function castSpell(spellId, targetId) {
  const endpoint = targetId ? `/user/class/cast/${spellId}?targetId=${targetId}` : `/user/class/cast/${spellId}`;
  const response = await habiticaClient.post(endpoint);
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Spell cast: ${spellId}`, `成功施放技能: ${spellId}`, `スキル使用成功: ${spellId}`),
      },
    ],
  };
}

async function getTags() {
  const response = await habiticaClient.get('/tags');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

async function createTag(name) {
  const response = await habiticaClient.post('/tags', { name });
  const tag = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Tag created: ${tag.name} (ID: ${tag.id})`, `成功创建标签: ${tag.name} (ID: ${tag.id})`, `タグ作成成功: ${tag.name} (ID: ${tag.id})`),
      },
    ],
  };
}

async function getPets() {
  const response = await habiticaClient.get('/user');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data.data.items.pets, null, 2),
      },
    ],
  };
}

async function feedPet(pet, food) {
  const response = await habiticaClient.post(`/user/feed/${pet}/${food}`);
  const result = response.data.data;
  
  let message = t(`Fed pet ${pet}! `, `成功喂养宠物 ${pet}! `, `ペット ${pet} に餌を与えました！ `);
  if (result.message) {
    message += result.message;
  }
  
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  };
}

async function hatchPet(egg, hatchingPotion) {
  const response = await habiticaClient.post(`/user/hatch/${egg}/${hatchingPotion}`);
  const result = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Pet hatched! Got ${egg}-${hatchingPotion}`, `成功孵化宠物! 获得了 ${egg}-${hatchingPotion}`, `ペット孵化成功！ ${egg}-${hatchingPotion} を獲得`),
      },
    ],
  };
}

async function getMounts() {
  const response = await habiticaClient.get('/user');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data.data.items.mounts, null, 2),
      },
    ],
  };
}

async function equipItem(type, key) {
  const response = await habiticaClient.post(`/user/equip/${type}/${key}`);
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Equipped ${type}: ${key}`, `成功装备 ${type}: ${key}`, `装備成功 ${type}: ${key}`),
      },
    ],
  };
}

async function getNotifications() {
  const response = await habiticaClient.get('/notifications');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

async function readNotification(notificationId) {
  await habiticaClient.post(`/notifications/${notificationId}/read`);
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Notification marked as read (ID: ${notificationId})`, `成功标记通知为已读 (ID: ${notificationId})`, `通知を既読にしました (ID: ${notificationId})`),
      },
    ],
  };
}

async function getShop(shopType = 'market') {
  const response = await habiticaClient.get(`/shops/${shopType}`);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

async function buyItem(itemKey, quantity = 1) {
  const response = await habiticaClient.post(`/user/buy/${itemKey}`, { quantity });
  const result = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Purchased ${itemKey} x${quantity}! Remaining Gold: ${result.gp}`, `成功购买 ${itemKey} x${quantity}! 剩余金币: ${result.gp}`, `${itemKey} x${quantity} 購入成功！ 残りGold: ${result.gp}`),
      },
    ],
  };
}

async function getTaskChecklist(taskId) {
  const response = await habiticaClient.get(`/tasks/${taskId}`);
  const task = response.data.data;
  const checklist = task.checklist || [];
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Task: ${task.text}\nChecklist items (${checklist.length}):`, `任务: ${task.text}\n清单项目 (${checklist.length}):`, `タスク: ${task.text}\nチェックリスト (${checklist.length}件):`),
      },
      {
        type: 'text',
        text: checklist.length > 0 
          ? checklist.map(item => `${item.completed ? '✓' : '○'} ${item.text} (ID: ${item.id})`).join('\n')
          : t('No checklist items found', '未找到清单项目', 'チェックリスト項目なし'),
      },
    ],
  };
}

async function addChecklistItem(taskId, text) {
  const response = await habiticaClient.post(`/tasks/${taskId}/checklist`, { text });
  const item = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Checklist item added: ${item.text} (ID: ${item.id})`, `成功添加清单项目: ${item.text} (ID: ${item.id})`, `チェックリスト項目追加: ${item.text} (ID: ${item.id})`),
      },
    ],
  };
}

async function updateChecklistItem(taskId, itemId, updates) {
  const response = await habiticaClient.put(`/tasks/${taskId}/checklist/${itemId}`, updates);
  const item = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Checklist item updated: ${item.text}`, `成功更新清单项目: ${item.text}`, `チェックリスト項目更新: ${item.text}`),
      },
    ],
  };
}

async function deleteChecklistItem(taskId, itemId) {
  await habiticaClient.delete(`/tasks/${taskId}/checklist/${itemId}`);
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Checklist item deleted (ID: ${itemId})`, `成功删除清单项目 (ID: ${itemId})`, `チェックリスト項目削除 (ID: ${itemId})`),
      },
    ],
  };
}

async function scoreChecklistItem(taskId, itemId) {
  const response = await habiticaClient.post(`/tasks/${taskId}/checklist/${itemId}/score`);
  const item = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Checklist item scored: ${item.text} (completed: ${item.completed})`, `成功评分清单项目: ${item.text} (完成状态: ${item.completed})`, `チェックリスト項目スコア: ${item.text} (完了: ${item.completed})`),
      },
    ],
  };
}

// 启动服务器
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(t('Habitica MCP server started', 'Habitica MCP 服务器已启动', 'Habitica MCP サーバー起動完了'));
}

runServer().catch((error) => {
  console.error(t('Server startup failed:', '服务器启动失败:', 'サーバー起動失敗:'), error);
  process.exit(1);
});
