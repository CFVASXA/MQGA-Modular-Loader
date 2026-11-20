"""Build a candidate archive from committed source only; verify in a fresh temp dir."""
from pathlib import Path
import hashlib,json,subprocess,zipfile,tempfile
repo=Path(__file__).resolve().parent
outdir=repo/'release'
outdir.mkdir(exist_ok=True)
commit=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','-C',str(repo),'ls-files','-z']).decode().split('\0')
payload={name:subprocess.check_output(['git','-C',str(repo),'show','HEAD:'+name]) for name in files if name}
payload['RELEASE.json']=(json.dumps({'version':'0.2.0-rewrite.1','commit':commit,'repository':'https://github.com/CFVASXA/MQGA-Modular-Loader','ci':'https://github.com/CFVASXA/MQGA-Modular-Loader/actions/runs/44786439469','testCounts':{'rewrite':38,'legacyBaseline':55},'status':'development-candidate','liveQQDeployment':False},indent=2)+'\n').encode()
payload['RELEASE.txt']='''MQGA Modular Loader 0.2.0-rewrite.1 — development candidate

源码来自 RELEASE.json 记录的 Git 提交。此包不是 QQ 安装器，也未替换当前 QQ。

验证：38 项新版核心/运行时/兼容测试 + 55 项冻结旧实现回归测试。
GitHub CI：Windows/Linux × Node 22/24，四项通过。

包含旧 MQGA/LiteLoader API、插件三段入口、设置面板与 renderer 兼容实现；
新核心按运行时、插件生命周期、配置、Electron 适配器和服务连接器拆分。
新增可注销事件、服务注册、插件上下文、适配器和健康状态接口。

不会自动覆盖加载器。首次运行请参照 README.md 准备原项目支持的加载入口。
现有用户应先备份，在独立目录验证实际插件与 QQ 版本后再迁移。
真实 QQ 和第三方插件的完整兼容尚未验证；mock 测试不是完整认证。
'''.encode()
manifest={name:hashlib.sha256(data).hexdigest() for name,data in payload.items()}
payload['SHA256SUMS.json']=(json.dumps(manifest,indent=2)+'\n').encode()
archive=outdir/'MQGA-Modular-Loader-0.2.0-rewrite.1-source.zip'
if archive.exists():raise SystemExit('Release asset exists; refusing to overwrite.')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for name,data in payload.items():z.writestr(name,data)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for name,digest in manifest.items():assert hashlib.sha256(z.read(name)).hexdigest()==digest
with tempfile.TemporaryDirectory(prefix='mqga-release-verify-') as tmp:
    target=Path(tmp)
    with zipfile.ZipFile(archive) as z:z.extractall(target)
    subprocess.run(['npm','test'],cwd=target,check=True)
    subprocess.run(['npm','run','test:legacy'],cwd=target,check=True)
sha=hashlib.sha256(archive.read_bytes()).hexdigest()
(outdir/'SHA256SUMS.txt').write_text(sha+'  '+archive.name+'\n',encoding='utf-8')
print('Commit:',commit)
print('Archive:',archive)
print('SHA256:',sha)
print('Verified archive CRCs, every source hash, and both test suites from a fresh extracted directory.')
