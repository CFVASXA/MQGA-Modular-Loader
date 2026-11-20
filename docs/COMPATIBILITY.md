# Compatibility and rewrite contract

## Public surface retained

| Contract | Replacement path | Tested behavior |
|---|---|---|
| `src/main.js` | `Runtime.start()` + native entry handoff | simulated Electron startup, explicit status |
| `src/preload.js` | compatibility adapter in `legacy/preload.js` | source contract and original baseline; no real-window ESM test |
| main plugin | `PluginManager` scoped require graph | load, dependency order, error isolation, helper reload |
| preload plugin | retained compatibility adapter | legacy baseline; real Electron sandbox needs verification |
| renderer plugin | retained compatibility adapter | source/legacy contract; real browser import needs verification |
| setting panel | retained renderer bundle | source presence only; real QQ UI not tested |
| config API | `ConfigStore` namespaces | atomic write, shared legacy keys, path boundary |
| install/delete | `PluginLifecycle` | directory replacement rollback and data preservation |
| legacy globals | `compat/bootstrap.js` + renderer bridge | original main hooks and renderer source retained |
| resource schemes | `ResourceProtocol` | root/profile mapping, traversal and redirect rejection |
| app/session events | `SessionInjector` and compatibility events | window/login/ready dispatch |

## New contracts

- **EventHub**: cancellable events. Plugin and renderer refresh events are separate.
- **ServiceHub**: explicit service registration and unregister; unknown IDs fail.
- **PluginContext**: scoped plugin storage, preferences, events and service access.
- **DisposableScope**: one-time reverse-order cleanup, including late registrations.
- **AdapterRegistry**: replaceable, describable connectors with failure isolation.
- **Health**: bounded runtime/component event report.

## Explicit non-goals for this candidate

- No replacement QQ installation or silent live deployment.
- No claim of compatibility with all QQ versions or plugins.
- No sandbox guarantee for old main-process plugin code.
- No remote network control listener, credential store, telemetry or account migration.
- No automatic native/ESM hot swapping.
