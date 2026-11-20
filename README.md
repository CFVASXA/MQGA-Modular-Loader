# MQGA Modular Loader（重写候选版）

这是一个 **MakeQQGreatAgain 加载器的模块化重写候选项目**。不是官方 QQ、LiteLoaderQQNT 或上游 MakeQQGreatAgain 的正式版本，尚未合并到上游，也未替换你当前正在使用的加载器。

## 目标

保留原有 MQGA / LiteLoader 插件接口和设置面板，替换内部巨石模块，提供有边界的运行时、插件生命周期和连接器接口。

- 运行时组合：`src/core/runtime.js`
- 事件 / 服务 / 生命周期：`src/core/{events,context,disposable}.js`
- 插件发现、依赖、加载：`src/plugins/{catalog,graph,manager}.js`
- 插件安装与删除事务：`src/plugins/lifecycle.js`
- 配置与共享偏好：`src/config/{store,preferences}.js`
- Electron 会话和资源：`src/electron/{session,protocol}.js`
- 旧 API 与 IPC 兼容：`src/compat/*`
- 渲染进程兼容实现：`legacy/preload.js`、`legacy/lq.bundle.js`

`legacy/` 中保留了旧 renderer/ESM/设置面板实现和对应来源。它现在是兼容适配器，不再与新的核心运行时纠缠。

## 保留的兼容面

- `MQGA` 和 `LiteLoader` 全局对象（按原有调用来源限制）；
- `mqga.sync`、`mqga.async`、`mqga.readText`、`mqga.exists`、`mqga.writeText`、`mqga.readFile`、`mqga.preloadHit`、`mqga.rendererScripts` IPC；
- `local://`、`mqga://` 资源协议及 root/profile 路径；
- 插件 `manifest.json` 的 `main`、`preload`、`renderer` 三段；
- `onReady`、`onBrowserWindowCreated`、`onLogin`、`onSettingWindowCreated` 钩子；
- 插件目录、数据目录、`loader.json` 和旧版面板配置；
- 安装、覆盖、启停、重载、删除及旧版排队删除；
- 登录窗口保护、Vue/设置面板、插件 renderer ESM 加载兼容路径。

## 新增扩展点

### 类型化插件上下文

```js
module.exports = {
    async initialize(context) {
        context.storage.set({ready:true});
        const unsubscribe = context.events.on("plugin:loaded", ({slug}) => {});
        // initialize 失败或运行时关闭时，scope 负责清理；connector 可显式保存 unsubscribe。
        context.logger.info("connected", context.slug);
    },
};
```

`context.slug`、`context.path`、`context.events`、`context.services`、`context.storage`、`context.preferences`、`context.logger` 都有明确归属。插件默认不能直接调用未授权的文件、IPC、shell 能力；旧插件原有的主进程 Node 权限保持不变，不能把新上下文当作对旧插件的 sandbox。

### 事件连接器

`events.on(name, handler)` 返回取消订阅函数。新事件有 `catalog:changed`、`plugin:loaded`、`plugins:refreshed`、`window:created`、`window:loaded`、`qq:login`、`app:ready`、`shutdown`。

`window:creating` 只表示构造前事件。`window:created` 事件处理器接收窗口实例；插件旧式钩子通过兼容桥获得原参数。

### 服务连接器

`ServiceHub.register(id, service)` 返回注销函数。ID 使用 `a-z`、`0-9`、`.`、`-`。重复 ID 和不存在的服务会明确报错，不静默回退到另一实现。

### 适配器

`AdapterRegistry.registerAdapter({id,description,capabilities,connect,disconnect})` 支持描述能力、失败隔离和后续替换。当前内置 Electron、资源协议、ZIP 和健康状态连接器接口。这里只提供本地进程内连接点，没有开放 TCP/HTTP 远程控制接口。

## 测试

要求 Node.js 22 或更新，无运行时 npm 依赖。

```sh
npm test
npm run test:legacy
```

- 38 项新核心、运行时和兼容契约测试；
- 55 项冻结旧实现的回归基线（独立副本，不是拿旧测试误测新模块）。

测试使用 Node 内置 runner、模拟 Electron、临时插件与配置目录；不会启动 QQ、修改 QQ 安装或读取用户聊天/账号数据。

## Renderer 重建

`legacy/lq.bundle.js` 已随包提供，可直接使用。修改兼容 renderer 后执行：

```sh
npm install --no-save --package-lock=false esbuild
npm run build:renderer
```

## 当前边界

**这是开发候选版，不是完整真实 QQ 兼容认证。**

- 已验证模块契约和模拟 Electron 启动/原生 QQ 入口交还。
- 尚未在本机真实 QQ 安装此重写版，尚未逐个验证第三方插件。
- 配置/插件目录的 junction 或重定向策略与旧版不同；默认拒绝这类部署。要把代码迁移到另一目录，请复制文件，而不是把现有目录改成链接。
- 原生 `.node` 和 ESM 主进程模块会标记“需要重启”，不会强行热重载。
- 登录窗口默认不注入，避免干扰安全登录控件。
- 这里不包含 QQ 注入器、绕过文件校验的 DLL、账号数据、私有插件或本机配置。原有加载入口可以复用；首次安装仍按上游项目准备。

## 迁移与回退

1. 保留现有加载器、插件和配置的完整备份。
2. 在独立目录部署此重写仓库，不覆盖当前加载器。
3. 先运行两套测试，再在单独测试环境复制 `plugins/` 和 `data/` 验证。
4. 通过目标 QQ 版本和实际插件验证后，才考虑替换入口。
5. 入口和旧版代码未在此仓库自动修改，因此回退到旧目录和旧入口不需要卸载插件。

## 许可

MIT。保留原 MochiLoader contributors 声明；LiteLoaderQQNT renderer 部分来自其 MIT 源码。详见 `LICENSE`、`NOTICE.md` 和 `docs/COMPATIBILITY.md`。
