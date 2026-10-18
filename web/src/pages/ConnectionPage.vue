<template>
  <div class="page connection-page">
    <section class="connection-banner">
      <div class="connection-banner-icon">
        <Server :size="20" />
      </div>
      <div class="connection-banner-copy">
        <span class="connection-banner-label">{{ templateMode ? '当前配置模式' : '当前 frps 连接' }}</span>
        <strong>{{ serverSummary }}</strong>
        <span class="connection-banner-sub">
          {{ templateMode ? 'Go 模板会原样保留，frpc 在应用时展开；结构化表单暂时隐藏。' : '配置会写入 frpc.toml，应用时由 frpc 原生校验。' }}
        </span>
      </div>
      <span class="connection-banner-status" :class="`tone-${connectionTone}`">
        <StatusDot :tone="connectionTone" :pulse="store.runtimeStatus === 'running'" />
        {{ connectionText }}
      </span>
      <div class="connection-banner-actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="openImport">
          <Upload :size="14" />
          导入配置
        </button>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="tomlLoading" @click="openToml">
          <FileCode2 :size="14" />
          {{ tomlLoading ? '生成中…' : '查看 TOML' }}
        </button>
      </div>
    </section>

    <div v-if="!templateMode" class="section-pills" aria-label="配置章节">
      <button v-for="section in sections" :key="section.id" type="button" @click="scrollTo(section.id)">
        <component :is="section.icon" :size="14" />
        {{ section.label }}
      </button>
    </div>

    <div class="connection-layout" :class="{ 'is-template': templateMode }">
      <aside v-if="!templateMode" class="connection-nav">
        <div class="connection-nav-inner card">
          <p class="connection-nav-label">配置章节</p>
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            class="connection-nav-item"
            @click="scrollTo(section.id)"
          >
            <component :is="section.icon" :size="15" />
            <span>{{ section.label }}</span>
            <ChevronRight :size="13" />
          </button>
          <div class="connection-nav-foot">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="validating" @click="runValidate">
              <Loader2 v-if="validating" :size="14" class="spin" />
              <ShieldCheck v-else :size="14" />
              {{ validating ? '校验中' : '校验配置' }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" @click="openToml">TOML 预览</button>
          </div>
        </div>
      </aside>

      <div class="connection-main">
        <Transition name="fade">
          <div v-if="issues.length" class="validation-banner" :class="errorCount ? 'is-error' : 'is-warning'">
            <div class="validation-icon">
              <TriangleAlert :size="18" />
            </div>
            <div class="validation-copy">
              <strong>
                {{ errorCount ? `${errorCount} 个错误需要处理` : `${warningCount} 条配置提示` }}
                <span v-if="lastValidated">· {{ lastValidated }} 校验</span>
              </strong>
              <ul>
                <li v-for="(item, index) in visibleIssues" :key="`${item.path}-${index}`">
                  <code v-if="item.path">{{ item.path }}</code>
                  <span>{{ item.message }}</span>
                </li>
              </ul>
              <span v-if="issues.length > visibleIssues.length" class="validation-more">
                还有 {{ issues.length - visibleIssues.length }} 项…
              </span>
            </div>
            <div class="validation-actions">
              <button type="button" class="icon-btn" title="重新校验" aria-label="重新校验" @click="runValidate">
                <RefreshCw :size="15" :class="{ spin: validating }" />
              </button>
              <button type="button" class="icon-btn" title="关闭" aria-label="关闭提示" @click="store.issues = []">
                <X :size="15" />
              </button>
            </div>
          </div>
        </Transition>

        <section v-if="templateMode" class="template-workspace">
          <div class="card template-editor-card">
            <header class="template-editor-head">
              <div>
                <span class="template-kicker"><FileCode2 :size="14" /> GO TEMPLATE</span>
                <h2>模板配置</h2>
                <p>这段内容会按原文保存。frpc 在启动前执行模板函数与 range 循环，FrpcDeck 不会展开或重排它。</p>
              </div>
              <span class="template-mode-badge">模板模式</span>
            </header>

            <div class="template-notice" :class="{ 'is-warning': templateHasWebServer }">
              <TriangleAlert v-if="templateHasWebServer" :size="15" />
              <Info v-else :size="15" />
              <span v-if="templateHasWebServer">
                模板已声明 <code>[webServer]</code>，面板不会覆盖。请确认管理接口地址和凭据与「管理接口」设置一致，否则实时状态可能不可用。
              </span>
              <span v-else>
                模板未声明 <code>[webServer]</code>，应用时会由 FrpcDeck 自动追加面板所需的管理接口配置。
              </span>
            </div>

            <textarea
              v-model="config.rawTemplate"
              class="input textarea template-textarea"
              spellcheck="false"
              aria-label="Go 模板配置"
              placeholder="粘贴 frpc Go 模板配置…"
            />

            <div class="template-meta">
              <span>{{ templateLineCount }} 行 · 原样保留</span>
              <span class="text-muted">支持 frp v0.56+ 的 Go template 与 parseNumberRangePair</span>
            </div>

            <div class="template-actions">
              <button type="button" class="btn btn-ghost" @click="exitTemplateOpen = true">
                <LogOut :size="15" />
                退出模板模式
              </button>
              <span class="template-actions-spacer" />
              <button type="button" class="btn btn-secondary" :disabled="validating" @click="runValidate">
                <ShieldCheck :size="15" />
                校验模板
              </button>
              <button type="button" class="btn btn-secondary" :disabled="tomlLoading" @click="openToml">
                <FileCode2 :size="15" />
                预览 TOML
              </button>
              <button type="button" class="btn btn-primary" :disabled="!store.dirty || store.saving" @click="apply">
                <Loader2 v-if="store.saving" :size="15" class="spin" />
                <Check v-else :size="15" />
                {{ store.saving ? '应用中…' : '应用更改' }}
              </button>
            </div>
          </div>
          <p class="template-readonly-note">
            <Info :size="14" />
            模板模式下，代理页展示的是 frpc 运行时生成的只读结果；要修改代理，请直接编辑上方模板。
          </p>
        </section>

        <template v-else>
          <FormSection
          anchor="server"
          title="frps 服务器"
          description="frpc 启动后会连接这个地址，并从这里接受代理请求。"
        >
          <template #icon><Server :size="17" /></template>
          <div class="form-grid">
            <FormField
              label="服务器地址"
              required
              :error="fieldError('serverAddr')"
              hint="域名或 IP 地址，不要带协议前缀。"
            >
              <input v-model="config.serverAddr" class="input input-mono" type="text" placeholder="frps.example.com" spellcheck="false" />
            </FormField>
            <FormField label="服务器端口" required :error="fieldError('serverPort')">
              <input v-model.number="config.serverPort" class="input input-mono" type="number" min="1" max="65535" placeholder="7000" />
            </FormField>
            <FormField label="用户标识" hint="设置后代理名会变为 user.proxy，可用于团队隔离。">
              <input v-model="config.user" class="input input-mono" type="text" placeholder="可选，例如 team-a" />
            </FormField>
            <FormField label="客户端 ID" hint="可选的唯一实例标识，留空即可。">
              <input v-model="config.clientID" class="input input-mono" type="text" placeholder="可选" />
            </FormField>
            <FormField label="STUN 服务器" hint="用于 NAT 穿透辅助。留空使用 frpc 默认值。" wide>
              <input v-model="config.natHoleStunServer" class="input input-mono" type="text" placeholder="stun.easyvoip.com:3478" />
            </FormField>
          </div>
          <div class="switch-row">
            <div class="switch-copy">
              <strong>首次登录失败后退出</strong>
              <small>关闭后 frpc 会持续重连 frps，适合网络不稳定的环境。</small>
            </div>
            <ToggleSwitch v-model="config.loginFailExit" />
          </div>
        </FormSection>

        <FormSection anchor="auth" title="身份认证" description="与 frps 的 auth.method / token 保持一致。">
          <template #icon><KeyRound :size="17" /></template>
          <div class="form-grid">
            <FormField label="认证方式" wide>
              <SegmentedControl v-model="config.auth.method" :options="authMethods" />
            </FormField>
          </div>

          <template v-if="config.auth.method === 'token'">
            <div class="form-grid">
              <FormField label="Token 来源">
                <select v-model="tokenMode" class="input select">
                  <option value="inline">直接填写</option>
                  <option value="file">从文件读取</option>
                </select>
              </FormField>
              <FormField v-if="tokenMode === 'inline'" label="Token" :error="fieldError('auth.token')">
                <div class="input-button-group">
                  <input v-model="config.auth.token" class="input input-mono" type="password" autocomplete="off" placeholder="与 frps 的 token 一致" />
                  <CopyButton :text="config.auth.token" icon-only />
                </div>
              </FormField>
              <FormField v-else label="Token 文件路径" :error="fieldError('auth.tokenSource.file.path')">
                <input v-model="config.auth.tokenSource.file.path" class="input input-mono" type="text" placeholder="/run/secrets/frp_token" />
              </FormField>
            </div>
            <FormField label="附加认证范围" hint="将认证信息附加到心跳或新建连接，通常无需修改。">
              <div class="check-chips">
                <button
                  v-for="scope in scopeChoices"
                  :key="scope"
                  type="button"
                  class="check-chip"
                  :class="{ 'is-active': config.auth.additionalScopes.includes(scope) }"
                  @click="toggleScope(scope)"
                >
                  <Check v-if="config.auth.additionalScopes.includes(scope)" :size="13" />
                  {{ scope }}
                </button>
              </div>
            </FormField>
          </template>

          <template v-else>
            <div class="form-grid">
              <FormField label="OIDC Client ID" required :error="fieldError('auth.oidc.clientID')">
                <input v-model="config.auth.oidc.clientID" class="input input-mono" type="text" />
              </FormField>
              <FormField label="OIDC Client Secret" required :error="fieldError('auth.oidc.clientSecret')">
                <input v-model="config.auth.oidc.clientSecret" class="input input-mono" type="password" autocomplete="off" />
              </FormField>
              <FormField label="Token Endpoint" required :error="fieldError('auth.oidc.tokenEndpointURL')" wide>
                <input v-model="config.auth.oidc.tokenEndpointURL" class="input input-mono" type="url" placeholder="https://auth.example.com/oauth/token" />
              </FormField>
              <FormField label="Audience">
                <input v-model="config.auth.oidc.audience" class="input" type="text" />
              </FormField>
              <FormField label="Scope">
                <input v-model="config.auth.oidc.scope" class="input" type="text" />
              </FormField>
            </div>
            <FormAccordion title="OIDC 高级选项" description="TLS、代理与附加参数">
              <template #icon><Settings2 :size="16" /></template>
              <div class="form-grid">
                <FormField label="自定义 CA 文件">
                  <input v-model="config.auth.oidc.trustedCaFile" class="input input-mono" type="text" placeholder="/etc/ssl/ca.pem" />
                </FormField>
                <FormField label="代理地址">
                  <input v-model="config.auth.oidc.proxyURL" class="input input-mono" type="text" placeholder="http://proxy:8080" />
                </FormField>
              </div>
              <div class="switch-row">
                <div class="switch-copy">
                  <strong>跳过 TLS 校验</strong>
                  <small>仅用于调试，生产环境不建议开启。</small>
                </div>
                <ToggleSwitch v-model="config.auth.oidc.insecureSkipVerify" />
              </div>
              <FormField label="附加端点参数">
                <KeyValueEditor v-model="config.auth.oidc.additionalEndpointParams" key-placeholder="参数名" value-placeholder="参数值" />
              </FormField>
            </FormAccordion>
          </template>
        </FormSection>

        <FormSection anchor="transport" title="传输设置" description="控制 frpc 与 frps 之间的连接方式与心跳。">
          <template #icon><Network :size="17" /></template>
          <div class="form-grid">
            <FormField label="传输协议">
              <select v-model="config.transport.protocol" class="input select">
                <option v-for="protocol in transportProtocols" :key="protocol" :value="protocol">{{ protocol }}</option>
              </select>
            </FormField>
            <FormField label="FRP 线路协议" hint="v2 需要 frps 显式开启。">
              <select v-model="config.transport.wireProtocol" class="input select">
                <option value="">默认（v1）</option>
                <option value="v1">v1</option>
                <option value="v2">v2</option>
              </select>
            </FormField>
            <FormField label="连接池数量" hint="预建立连接以降低延迟，0 表示关闭。">
              <input v-model.number="config.transport.poolCount" class="input input-mono" type="number" min="0" />
            </FormField>
            <FormField label="客户端绑定 IP" hint="仅 tcp / websocket 协议生效。">
              <input v-model="config.transport.connectServerLocalIP" class="input input-mono" type="text" placeholder="0.0.0.0" />
            </FormField>
            <FormField label="连接超时（秒）">
              <input v-model.number="config.transport.dialServerTimeout" class="input input-mono" type="number" />
            </FormField>
            <FormField label="TCP Keepalive（秒）" hint="负数表示禁用。">
              <input v-model.number="config.transport.dialServerKeepalive" class="input input-mono" type="number" />
            </FormField>
            <FormField label="心跳间隔（秒）">
              <input v-model.number="config.transport.heartbeatInterval" class="input input-mono" type="number" />
            </FormField>
            <FormField label="心跳超时（秒）">
              <input v-model.number="config.transport.heartbeatTimeout" class="input input-mono" type="number" />
            </FormField>
            <FormField label="代理服务器" hint="连接 frps 时经过的 HTTP / SOCKS5 / NTLM 代理。" wide>
              <input v-model="config.transport.proxyURL" class="input input-mono" type="text" placeholder="socks5://user:pass@127.0.0.1:1080" />
            </FormField>
          </div>
          <div class="switch-row">
            <div class="switch-copy">
              <strong>TCP 多路复用</strong>
              <small>需与 frps 保持一致，默认开启。</small>
            </div>
            <ToggleSwitch v-model="config.transport.tcpMux" />
          </div>
          <div v-if="config.transport.tcpMux" class="form-grid">
            <FormField label="Mux Keepalive（秒）">
              <input v-model.number="config.transport.tcpMuxKeepaliveInterval" class="input input-mono" type="number" />
            </FormField>
          </div>
          <FormAccordion v-if="config.transport.protocol === 'quic'" title="QUIC 选项" description="仅在使用 quic 传输时生效">
            <template #icon><Radio :size="16" /></template>
            <div class="form-grid">
              <FormField label="Keepalive（秒）">
                <input v-model.number="config.transport.quic.keepalivePeriod" class="input input-mono" type="number" />
              </FormField>
              <FormField label="最大空闲超时（秒）">
                <input v-model.number="config.transport.quic.maxIdleTimeout" class="input input-mono" type="number" />
              </FormField>
              <FormField label="最大并发流">
                <input v-model.number="config.transport.quic.maxIncomingStreams" class="input input-mono" type="number" />
              </FormField>
            </div>
          </FormAccordion>
        </FormSection>

        <FormSection anchor="tls" title="TLS 与证书" description="frpc 到 frps 的传输层加密。">
          <template #icon><ShieldCheck :size="17" /></template>
          <div class="switch-row">
            <div class="switch-copy">
              <strong>启用 TLS</strong>
              <small>frp 0.50+ 默认开启。关闭后流量将以明文传输。</small>
            </div>
            <ToggleSwitch v-model="config.transport.tls.enable" />
          </div>
          <div class="form-grid">
            <FormField label="客户端证书" hint="mTLS 场景使用，需与私钥同时配置。">
              <input v-model="config.transport.tls.certFile" class="input input-mono" type="text" placeholder="client.crt" />
            </FormField>
            <FormField label="客户端私钥">
              <input v-model="config.transport.tls.keyFile" class="input input-mono" type="text" placeholder="client.key" />
            </FormField>
            <FormField label="CA 证书">
              <input v-model="config.transport.tls.trustedCaFile" class="input input-mono" type="text" placeholder="ca.crt" />
            </FormField>
            <FormField label="TLS Server Name" hint="证书校验使用的 SNI。">
              <input v-model="config.transport.tls.serverName" class="input input-mono" type="text" placeholder="example.com" />
            </FormField>
          </div>
          <div class="switch-row">
            <div class="switch-copy">
              <strong>禁用自定义 TLS 首字节</strong>
              <small>默认开启。只有兼容旧版 frps 时才需要关闭。</small>
            </div>
            <ToggleSwitch v-model="config.transport.tls.disableCustomTLSFirstByte" />
          </div>
        </FormSection>

        <FormSection anchor="log" title="日志" description="面板会实时显示 frpc 输出；写入文件时也会自动跟随。">
          <template #icon><ScrollText :size="17" /></template>
          <div class="form-grid">
            <FormField label="日志输出" hint="console 表示标准输出；也可填写相对数据目录的文件路径。">
              <input v-model="config.log.to" class="input input-mono" type="text" placeholder="console" />
            </FormField>
            <FormField label="日志级别">
              <select v-model="config.log.level" class="input select">
                <option v-for="level in logLevels" :key="level" :value="level">{{ level }}</option>
              </select>
            </FormField>
            <FormField label="保留天数" hint="仅文件日志生效。">
              <input v-model.number="config.log.maxDays" class="input input-mono" type="number" min="0" />
            </FormField>
          </div>
          <div class="switch-row">
            <div class="switch-copy">
              <strong>禁用彩色输出</strong>
              <small>写入文件或日志采集时建议开启。</small>
            </div>
            <ToggleSwitch v-model="config.log.disablePrintColor" />
          </div>
        </FormSection>

        <FormSection
          anchor="admin"
          title="frpc 管理接口"
          description="面板通过这个本地接口读取代理实时状态，请勿随意关闭。"
        >
          <template #icon><Activity :size="17" /></template>
          <div class="form-grid">
            <FormField label="监听地址" required :error="fieldError('webServer.addr')">
              <input v-model="config.webServer.addr" class="input input-mono" type="text" placeholder="127.0.0.1" />
            </FormField>
            <FormField label="监听端口" required :error="fieldError('webServer.port')">
              <input v-model.number="config.webServer.port" class="input input-mono" type="number" min="1" max="65535" />
            </FormField>
            <FormField label="用户名">
              <input v-model="config.webServer.user" class="input" type="text" autocomplete="off" />
            </FormField>
            <FormField label="密码">
              <div class="input-button-group">
                <input v-model="config.webServer.password" class="input input-mono" type="text" autocomplete="off" />
                <button type="button" class="btn btn-secondary" @click="config.webServer.password = makeSecret(18)">
                  <RefreshCw :size="14" />
                  生成
                </button>
              </div>
            </FormField>
          </div>
          <p class="form-note" :class="{ 'note-warning': config.webServer.addr === '0.0.0.0' }">
            <TriangleAlert v-if="config.webServer.addr === '0.0.0.0'" :size="14" />
            <Info v-else :size="14" />
            <span v-if="config.webServer.addr === '0.0.0.0'">
              管理接口监听 0.0.0.0 会暴露 frpc 原生面板，请确保端口不对外网开放。
            </span>
            <span v-else>
              修改后需要重启 frpc 才能生效，面板会自动使用新的地址和凭据。
            </span>
          </p>
          <FormAccordion title="管理接口高级选项" description="pprof 与静态资源目录">
            <template #icon><Settings2 :size="16" /></template>
            <div class="form-grid">
              <FormField label="静态资源目录" hint="一般无需填写。">
                <input v-model="config.webServer.assetsDir" class="input input-mono" type="text" placeholder="./static" />
              </FormField>
            </div>
            <div class="switch-row">
              <div class="switch-copy">
                <strong>启用 pprof</strong>
                <small>暴露 Go 性能诊断接口，仅建议在调试时开启。</small>
              </div>
              <ToggleSwitch v-model="config.webServer.pprofEnable" />
            </div>
          </FormAccordion>
        </FormSection>

        <FormSection anchor="advanced" title="高级选项" description="DNS、UDP 包大小、元数据与实验特性。">
          <template #icon><SlidersHorizontal :size="17" /></template>
          <div class="form-grid">
            <FormField label="DNS 服务器" hint="frpc 解析服务器地址时使用。">
              <input v-model="config.dnsServer" class="input input-mono" type="text" placeholder="8.8.8.8" />
            </FormField>
            <FormField label="UDP 包大小" hint="需与 frps 保持一致，默认 1500。">
              <input v-model.number="config.udpPacketSize" class="input input-mono" type="number" min="1" />
            </FormField>
          </div>
          <div class="advanced-stack">
            <FormAccordion title="VirtualNet 与实验特性" description="需要 frps 同时开启对应 feature gate">
              <template #icon><Boxes :size="16" /></template>
              <div class="switch-row">
                <div class="switch-copy">
                  <strong>启用 VirtualNet</strong>
                  <small>为 frpc 分配虚拟网络地址，支持虚拟网络代理。</small>
                </div>
                <ToggleSwitch v-model="config.featureGates.VirtualNet" />
              </div>
              <div class="form-grid">
                <FormField label="虚拟网络地址" hint="CIDR 格式，例如 100.86.1.1/24。" wide>
                  <input v-model="config.virtualNet.address" class="input input-mono" type="text" placeholder="100.86.1.1/24" />
                </FormField>
              </div>
            </FormAccordion>

            <FormAccordion title="启动白名单与包含文件" description="start / includes 的兼容配置">
              <template #icon><ListFilter :size="16" /></template>
              <FormField label="启动白名单（start）" hint="留空表示启动所有已启用代理；填写后只启动列表中的代理。">
                <TagInput v-model="config.start" placeholder="输入代理名称后回车" />
              </FormField>
              <FormField label="包含文件（includes）" hint="可加载额外的代理配置文件；这些代理不会显示在面板中。">
                <TagInput v-model="config.includes" placeholder="./confd/*.toml" />
              </FormField>
            </FormAccordion>

            <FormAccordion title="客户端元数据" description="附加到 frpc 的键值信息，可供服务端插件读取">
              <template #icon><Tags :size="16" /></template>
              <KeyValueEditor v-model="config.metadatas" key-placeholder="键" value-placeholder="值" />
            </FormAccordion>
          </div>
        </FormSection>

        <div class="page-actions">
          <div class="page-actions-info">
            <span :class="store.dirty ? 'text-warning' : 'text-muted'">
              {{ store.dirty ? '有未应用的更改' : '配置已与运行文件同步' }}
            </span>
          </div>
          <button type="button" class="btn btn-ghost" :disabled="validating" @click="runValidate">
            <ShieldCheck :size="15" />
            校验
          </button>
          <button type="button" class="btn btn-secondary" :disabled="tomlLoading" @click="openToml">
            <FileCode2 :size="15" />
            预览 TOML
          </button>
          <button type="button" class="btn btn-primary" :disabled="!store.dirty || store.saving" @click="apply">
            <Loader2 v-if="store.saving" :size="15" class="spin" />
            <Check v-else :size="15" />
            {{ store.saving ? '应用中…' : '应用更改' }}
          </button>
        </div>
        </template>
      </div>
    </div>

    <ModalShell
      :open="showToml"
      title="frpc.toml 预览"
      subtitle="以下内容将写入数据目录并交给 frpc 校验。"
      variant="modal"
      size="lg"
      @close="showToml = false"
    >
      <div v-if="tomlLoading" class="toml-loading"><Loader2 :size="18" class="spin" /> 正在生成配置…</div>
      <CodeBlock v-else :code="toml" filename="frpc.toml" max-height="62vh" />
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="showToml = false">关闭</button>
        <button type="button" class="btn btn-secondary" @click="copyToml">复制</button>
        <button type="button" class="btn btn-primary" @click="downloadToml">
          <Download :size="15" />
          下载
        </button>
      </template>
    </ModalShell>

    <ModalShell
      :open="showImport"
      title="导入 frpc 配置"
      subtitle="支持 TOML、YAML、JSON 与旧版 INI；检测到 Go template 时会自动进入模板模式。"
      variant="modal"
      size="lg"
      @close="closeImport"
    >
      <div class="import-body">
        <div class="import-file-row">
          <label class="btn btn-secondary btn-sm import-file-btn">
            <FolderOpen :size="15" />
            选择配置文件
            <input type="file" accept=".toml,.yaml,.yml,.json,.ini,text/*" hidden @change="onFilePicked" />
          </label>
          <span class="import-filename">{{ importFilename || '未选择文件，可直接粘贴内容' }}</span>
        </div>
        <textarea
          v-model="importContent"
          class="input textarea import-textarea"
          spellcheck="false"
          placeholder="粘贴 TOML / YAML / JSON / INI 配置内容…"
          :disabled="Boolean(importResult)"
        />
        <div v-if="importResult" class="import-result">
          <div class="import-result-head">
            <span class="import-format">{{ importResult.format.toUpperCase() }}</span>
            <template v-if="importResult.format === 'template'">
              <span>模板模式 · 原样保留</span>
            </template>
            <template v-else>
              <span>{{ importResult.config.proxies?.length || 0 }} 个代理</span>
              <span>{{ importResult.config.visitors?.length || 0 }} 个访问器</span>
            </template>
            <span v-if="importResult.warnings?.length" class="text-warning">{{ importResult.warnings.length }} 条提示</span>
          </div>
          <p v-if="importResult.format === 'template'" class="import-template-note">
            <FileCode2 :size="15" />
            检测到 Go 模板语法。循环不会被展开，应用时由 frpc 执行；代理列表将显示运行时结果。
          </p>
          <ul v-if="importResult.warnings?.length" class="import-warnings">
            <li v-for="warning in importResult.warnings" :key="warning">{{ warning }}</li>
          </ul>
          <ul v-if="importResult.issues?.length" class="import-warnings">
            <li v-for="item in importResult.issues.slice(0, 6)" :key="item.path" :class="`level-${item.level}`">
              {{ item.message }}
            </li>
          </ul>
          <CodeBlock
            :code="importResult.toml"
            :filename="importResult.format === 'template' ? '模板预览（应用时写入）' : '转换后的 frpc.toml'"
            max-height="26vh"
          />
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="closeImport">取消</button>
        <template v-if="!importResult">
          <button type="button" class="btn btn-primary" :disabled="importing || !importContent.trim()" @click="parseImport">
            <Loader2 v-if="importing" :size="15" class="spin" />
            <FileSearch v-else :size="15" />
            {{ importing ? '解析中…' : '解析并预览' }}
          </button>
        </template>
        <template v-else>
          <button type="button" class="btn btn-secondary" @click="resetImport">重新选择</button>
          <button type="button" class="btn btn-primary" @click="applyImport">
            <Check :size="15" />
            替换当前草稿
          </button>
        </template>
      </template>
    </ModalShell>

    <ConfirmDialog
      :open="exitTemplateOpen"
      title="退出模板模式？"
      message="模板将从当前草稿中移除，底层的结构化配置会重新显示。应用更改前不会影响正在运行的 frpc。"
      confirm-label="退出模板模式"
      :loading="false"
      @cancel="exitTemplateOpen = false"
      @confirm="exitTemplateMode"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import {
  Activity,
  Boxes,
  Check,
  ChevronRight,
  Download,
  FileCode2,
  FileSearch,
  FolderOpen,
  Info,
  KeyRound,
  ListFilter,
  Loader2,
  LogOut,
  Network,
  Radio,
  RefreshCw,
  ScrollText,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-vue-next';
import CodeBlock from '@/components/CodeBlock.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import CopyButton from '@/components/CopyButton.vue';
import FormAccordion from '@/components/FormAccordion.vue';
import FormField from '@/components/FormField.vue';
import FormSection from '@/components/FormSection.vue';
import KeyValueEditor from '@/components/KeyValueEditor.vue';
import ModalShell from '@/components/ModalShell.vue';
import SegmentedControl from '@/components/SegmentedControl.vue';
import StatusDot from '@/components/StatusDot.vue';
import TagInput from '@/components/TagInput.vue';
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import { makeSecret } from '@/frp';
import {
  importConfig,
  previewToml,
  saveConfig,
  store,
  toast,
  validateDraft,
} from '@/store';

const config = computed(() => store.config);
const showToml = ref(false);
const toml = ref('');
const tomlSnapshot = ref('');
const tomlLoading = ref(false);
const validating = ref(false);
const lastValidated = ref('');
const showImport = ref(false);
const importContent = ref('');
const importFilename = ref('');
const importResult = ref(null);
const importing = ref(false);
const exitTemplateOpen = ref(false);

const templateMode = computed(() => Boolean(config.value?.rawTemplate));
const templateHasWebServer = computed(
  () => /^\s*(?:\[webServer\]|webServer\s*=|webServer\.)/m.test(config.value?.rawTemplate || ''),
);
const templateLineCount = computed(() => {
  const text = String(config.value?.rawTemplate || '').replace(/\n$/, '');
  return text ? text.split('\n').length : 0;
});

const authMethods = [
  { value: 'token', label: 'Token' },
  { value: 'oidc', label: 'OIDC' },
];
const transportProtocols = ['tcp', 'kcp', 'quic', 'websocket', 'wss'];
const logLevels = ['trace', 'debug', 'info', 'warn', 'error'];
const scopeChoices = ['HeartBeats', 'NewWorkConns'];

const sections = [
  { id: 'server', label: 'frps 服务器', icon: Server },
  { id: 'auth', label: '身份认证', icon: KeyRound },
  { id: 'transport', label: '传输设置', icon: Network },
  { id: 'tls', label: 'TLS 与证书', icon: ShieldCheck },
  { id: 'log', label: '日志', icon: ScrollText },
  { id: 'admin', label: '管理接口', icon: Activity },
  { id: 'advanced', label: '高级选项', icon: SlidersHorizontal },
];

const tokenMode = computed({
  get: () => (config.value.auth.tokenSource.type === 'file' ? 'file' : 'inline'),
  set: (value) => {
    if (value === 'file') {
      config.value.auth.token = '';
      config.value.auth.tokenSource.type = 'file';
    } else {
      config.value.auth.tokenSource.type = '';
      config.value.auth.tokenSource.file.path = '';
    }
  },
});

const serverSummary = computed(() => {
  if (templateMode.value) return 'Go 模板配置（原样保留）';
  if (!config.value?.serverAddr) return '尚未配置 frps 服务器';
  return `${config.value.serverAddr}:${config.value.serverPort || 7000}`;
});
const connectionText = computed(() => {
  if (store.runtimeStatus === 'running' && store.connection === 'online') return '已连接';
  if (store.runtimeStatus === 'running' && store.connection === 'connecting') return '连接中';
  if (store.runtimeStatus === 'running') return '重连中';
  if (store.runtimeStatus === 'error') return '启动失败';
  if (store.runtimeStatus === 'starting') return '启动中';
  return '未运行';
});
const connectionTone = computed(() => {
  if (store.runtimeStatus === 'running' && store.connection === 'online') return 'success';
  if (store.runtimeStatus === 'running' || store.runtimeStatus === 'starting') return 'warning';
  if (store.runtimeStatus === 'error') return 'danger';
  return 'muted';
});

const issues = computed(() => store.issues || []);
const errorCount = computed(() => issues.value.filter((item) => item.level === 'error').length);
const warningCount = computed(() => issues.value.filter((item) => item.level === 'warning').length);
const visibleIssues = computed(() => issues.value.slice(0, 7));

function fieldError(path) {
  return issues.value.find((item) => item.path === path && item.level === 'error')?.message || '';
}

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleScope(scope) {
  const scopes = config.value.auth.additionalScopes;
  const index = scopes.indexOf(scope);
  if (index >= 0) scopes.splice(index, 1);
  else scopes.push(scope);
}

async function runValidate() {
  if (validating.value) return;
  validating.value = true;
  try {
    const result = await validateDraft();
    const errors = result.issues?.filter((item) => item.level === 'error').length || 0;
    const warnings = result.issues?.filter((item) => item.level === 'warning').length || 0;
    lastValidated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    if (errors) toast(`发现 ${errors} 个错误，请查看页面顶部`, 'error', 5000);
    else if (warnings) toast(`校验通过，有 ${warnings} 条提示`, 'info', 4000);
    else toast('配置校验通过', 'success');
    if (result.verify?.unavailable) toast('未找到 frpc，已跳过二进制校验', 'info');
  } catch (error) {
    toast(error.message || '校验失败', 'error');
  } finally {
    validating.value = false;
  }
}

async function openToml() {
  showToml.value = true;
  const snapshot = JSON.stringify(store.config);
  if (toml.value && tomlSnapshot.value === snapshot) return;
  tomlLoading.value = true;
  try {
    const result = await previewToml();
    toml.value = result.toml;
    tomlSnapshot.value = snapshot;
  } catch (error) {
    toast(error.message || '生成 TOML 失败', 'error');
    showToml.value = false;
  } finally {
    tomlLoading.value = false;
  }
}

async function copyToml() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(toml.value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = toml.value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    toast('已复制 TOML', 'success', 1800);
  } catch {
    toast('复制失败，请手动选择', 'error');
  }
}

function downloadToml() {
  const blob = new Blob([toml.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'frpc.toml';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function apply() {
  try {
    await saveConfig({ restart: true });
  } catch {
    // Store handles the toast and issue list.
  }
}

function openImport() {
  showImport.value = true;
  importContent.value = '';
  importFilename.value = '';
  importResult.value = null;
}

function closeImport() {
  if (importing.value) return;
  showImport.value = false;
}

function resetImport() {
  importResult.value = null;
}

async function onFilePicked(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 1024 * 1024) {
    toast('配置文件不能超过 1 MB', 'error');
    event.target.value = '';
    return;
  }
  importFilename.value = file.name;
  importContent.value = await file.text();
  importResult.value = null;
  event.target.value = '';
}

async function parseImport() {
  importing.value = true;
  try {
    const result = await importConfig(importContent.value, importFilename.value);
    importResult.value = result;
    store.issues = result.issues || [];
  } catch (error) {
    toast(error.message || '无法解析配置', 'error', 6000);
  } finally {
    importing.value = false;
  }
}

function applyImport() {
  if (!importResult.value) return;
  store.config = importResult.value.config;
  store.issues = importResult.value.issues || [];
  showImport.value = false;
  toast(
    importResult.value.format === 'template'
      ? '模板已导入草稿；检查后点击“应用更改”'
      : '配置已导入草稿，检查后点击“应用更改”',
    'success',
    5000,
  );
}

function exitTemplateMode() {
  if (!config.value) return;
  config.value.rawTemplate = '';
  store.issues = [];
  exitTemplateOpen.value = false;
  toast('已退出模板模式，请检查结构化配置后重新应用', 'info', 5000);
}
</script>
