# 右侧双链关系侧边栏设计文档

## 背景与目标
为主界面增加一个右侧侧边栏，用于展示笔记之间的双链关系，视觉与交互参考 Obsidian 的“Backlinks/Linked Mentions”风格。用户未选中任何笔记时展示当前视图内所有节点的双链概览；当选中某条笔记时，展示与该节点递归关联的所有节点，并区分出链/入链与递归关系层级。

## 需求拆解
1. **右侧侧边栏**：固定于主界面右侧，桌面端显示，移动端隐藏。
2. **双链关系展示**：
   - 无选中笔记：展示当前视图内所有节点的双链关系概览（节点 + 入/出链统计）。
   - 选中笔记：仅展示与该节点递归关联的所有节点。
3. **样式参考 Obsidian**：小标题、数量统计、列表项、圆点/连线式视觉提示、清晰的区块划分。
4. **递归关联**：
   - 通过“references”和“referencedBy”双向关系逐层扩展；
   - 采用去重机制避免环路；
   - 记录深度用于缩进层级展示。

## 数据与接口
### 现有接口
后端已有笔记引用关系查询接口：
- `api.notes.noteReferenceList`：按 `noteId + type (references/referencedBy)` 查询引用关系列表。

### 数据模型
```ts
type GraphNode = {
  id: number;
  title: string;
  content?: string;
  updatedAt?: string | Date | null;
};

type GraphEdge = {
  from: number;
  to: number;
  type: 'references' | 'referencedBy';
};
```

### 递归关系构建
1. 以选中节点为 root，初始化队列。
2. 每次弹出一个节点：
   - 分别请求 references / referencedBy；
   - 记录 edge；
   - 未访问的节点入队（深度 +1）。
3. 使用 `visited` 集合去重，避免循环。
4. 记录 `depthById` 以控制列表缩进。

## 交互与展示
### 侧边栏结构
1. 顶部 Header：
   - 图标 + 标题（“双链关系 / Linked Notes”）
   - 当前模式提示（全局视图 / 选中笔记）
   - 节点数量 / 关系数量统计
2. 内容区：
   - **选中笔记模式**：
     - 出链列表（Outbound）
     - 入链列表（Backlinks）
     - 递归关联列表（Related graph）
   - **全局模式**：
     - 当前视图内节点列表 + 入/出链统计

### 交互逻辑
- 点击列表项：更新当前选中笔记，侧边栏切换到选中模式，并刷新递归关系。
- 递归列表项按深度缩进展示，视觉上体现关系距离。

## UI 与样式
### Obsidian 风格参考
**要点**：
- 列表项紧凑、弱分割线
- 小标题 uppercase + 数量
- 轻量背景、圆点表示节点

### Tailwind 风格约定
- 宽度：`w-80`
- 桌面端显示：`hidden xl:flex`
- 背景层次：`bg-background/60 backdrop-blur-sm`
- 边框：`border-l border-divider`
- 列表项 hover：`hover:bg-hover`

## 性能与边界
1. **网络开销**：递归查询会触发多次接口调用；
2. **去重**：使用 `visited` 防止无限递归；
3. **数据范围**：全局模式仅基于当前视图内的数据（不扩展跨视图关系）。

## 未来扩展
1. 增加深度上限或分页策略；
2. 支持关系筛选（仅出链 / 仅入链）；
3. 可视化图谱（force-graph 或 D3）。
