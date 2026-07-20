import "./browser-polyfills";
import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileDown,
  Lock,
  Menu,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WagmiProvider, createConfig, http, useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWalletClient, useWriteContract } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import type { EERCHookResult } from "@avalabs/eerc-sdk";
import { type Abi, type Address, type PublicClient, type WalletClient, formatUnits, isAddress, keccak256, parseUnits, stringToHex, zeroAddress } from "viem";
import registryAbi from "./contracts/StealthTipRegistry.abi.json";
import "./styles.css";
import "./live-report.css";

type Tip = { id: number; sender: string; amount: number | null; date: string; tx: string; revealed: boolean };
type Creator = { handle: string; name: string; category: string; avatar: string; earned: string; address?: Address };
type Mode = "demo" | "live";
export type ConnectState = {
  mode: Mode;
  wallet: string | null;
  status: string;
  isLiveReady: boolean;
  isCorrectChain: boolean;
  connect: () => Promise<void> | void;
  disconnect: () => void;
  switchToFuji: () => Promise<void>;
};

export type LiveActions = {
  eerc: EERCHookResult;
  encryptedBalance: ReturnType<EERCHookResult["useEncryptedBalance"]>;
  decryptAsCurrentAuditor: () => Promise<Awaited<ReturnType<EERCHookResult["auditorDecrypt"]>>>;
  writeContractAsync: ReturnType<typeof useWriteContract>["writeContractAsync"];
  publicClient: PublicClient;
};

const demoTips: Tip[] = [
  { id: 1, sender: "@nexusrider", amount: 50, date: "2 min ago", tx: "0x48f9...c11a", revealed: false },
  { id: 2, sender: "@pixelwave", amount: 125, date: "1h ago", tx: "0xa8c2...3ea9", revealed: true },
  { id: 3, sender: "@solarbyte", amount: 32.5, date: "Yesterday", tx: "0x77db...11f0", revealed: false },
  { id: 4, sender: "@blockmuse", amount: 75, date: "Jun 30", tx: "0x19d1...9bd4", revealed: true },
];

const demoCreators: Creator[] = [
  { handle: "@alice_streams", name: "Alice Voss", category: "Gaming and live", avatar: "AV", earned: "$1,247" },
  { handle: "@kairo.codes", name: "Kairo Tan", category: "Open source", avatar: "KT", earned: "$841" },
  { handle: "@mira.makes", name: "Mira Chen", category: "Design", avatar: "MC", earned: "$596" },
];

const chartData = [
  { day: "Jul 1", value: 90 },
  { day: "Jul 5", value: 165 },
  { day: "Jul 9", value: 250 },
  { day: "Jul 13", value: 420 },
  { day: "Jul 17", value: 610 },
  { day: "Today", value: 740 },
];

const fujiExplorer = import.meta.env.VITE_FUJI_EXPLORER || "https://testnet.snowtrace.io";
const registryAddress = normalizeAddress(import.meta.env.VITE_TIP_REGISTRY_ADDRESS || import.meta.env.VITE_TIP_JAR_ADDRESS);
const eercAddress = normalizeAddress(import.meta.env.VITE_EERC_CONTRACT_ADDRESS || import.meta.env.VITE_EERC_TOKEN_ADDRESS);
const eercUnderlyingToken = normalizeAddress(import.meta.env.VITE_EERC_UNDERLYING_TOKEN_ADDRESS);
const appMode: Mode = import.meta.env.VITE_APP_MODE === "live" ? "live" : "demo";
// These are the exact public proving assets served by the Builder Console.
// They are intentionally versioned inside this project because a verifier only
// accepts proofs made with its matching zkey; a merely similar circuit fails.
const officialCircuitBase = "/circuits/official";
const circuitURLs = {
  register: { wasm: `${officialCircuitBase}/registration/registration.wasm`, zkey: `${officialCircuitBase}/registration/registration.zkey` },
  transfer: { wasm: `${officialCircuitBase}/transfer/transfer.wasm`, zkey: `${officialCircuitBase}/transfer/transfer.zkey` },
  mint: { wasm: `${officialCircuitBase}/mint/mint.wasm`, zkey: `${officialCircuitBase}/mint/mint.zkey` },
  withdraw: { wasm: `${officialCircuitBase}/withdraw/withdraw.wasm`, zkey: `${officialCircuitBase}/withdraw/withdraw.zkey` },
  burn: { wasm: `${officialCircuitBase}/burn/burn.wasm`, zkey: `${officialCircuitBase}/burn/burn.zkey` },
};
const missingLiveConfig = [
  !registryAddress && "VITE_TIP_REGISTRY_ADDRESS",
  !eercAddress && "VITE_EERC_CONTRACT_ADDRESS",
].filter(Boolean) as string[];
const isLiveConfigReady = missingLiveConfig.length === 0 && Boolean(registryAddress && eercAddress);

const wagmiConfig = createConfig({
  chains: [avalancheFuji],
  connectors: [injected()],
  transports: {
    [avalancheFuji.id]: http(import.meta.env.VITE_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc"),
  },
});
const queryClient = new QueryClient();
const stealthTipRegistryAbi = registryAbi as Abi;
const LiveEercBridge = lazy(() => import("./live-eerc"));

function normalizeAddress(value?: string): Address | undefined {
  return value && isAddress(value) ? value : undefined;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function navTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function AppRoot() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {appMode === "live" ? <LiveGate /> : <DemoGate />}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function DemoGate() {
  return <StealthStreamApp connection={useDemoConnection()} />;
}

function useDemoConnection(): ConnectState {
  const [wallet, setWallet] = useState<string | null>(null);
  return {
    mode: "demo",
    wallet,
    status: "Demo mode",
    isLiveReady: false,
    isCorrectChain: true,
    connect: () => setWallet("0x71A2cB9d6eF4aC06c9B8EE8A34FD3F0805D7A81A"),
    disconnect: () => setWallet(null),
    switchToFuji: async () => undefined,
  };
}

function LiveGate() {
  const account = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: avalancheFuji.id });
  const { data: walletClient } = useWalletClient({ chainId: avalancheFuji.id });
  const isCorrectChain = account.chainId === avalancheFuji.id;

  const connection: ConnectState = {
    mode: "live",
    wallet: account.address || null,
    status: isLiveConfigReady ? "Fuji live" : "Live config missing",
    isLiveReady: isLiveConfigReady,
    isCorrectChain,
    connect: async () => {
      await connectAsync({ connector: connectors[0] });
    },
    disconnect,
    switchToFuji: async () => {
      await switchChainAsync({ chainId: avalancheFuji.id });
    },
  };

  if (!isLiveConfigReady || !account.address || !walletClient || !publicClient || !eercAddress || !registryAddress) {
    return <StealthStreamApp connection={connection} />;
  }

  return (
    <ConnectedLiveApp
      connection={connection}
      publicClient={publicClient}
      walletClient={walletClient}
    />
  );
}

function ConnectedLiveApp({
  connection,
  publicClient,
  walletClient,
}: {
  connection: ConnectState;
  publicClient: PublicClient;
  walletClient: WalletClient;
}) {
  const decryptionKey = window.localStorage.getItem(eercKeyName(connection.wallet || ""));

  return (
    <Suspense fallback={<StealthStreamApp connection={connection} />}>
      <LiveEercBridge
        connection={connection}
        publicClient={publicClient}
        walletClient={walletClient}
        contractAddress={eercAddress!}
        underlyingToken={eercUnderlyingToken}
        circuitURLs={circuitURLs}
        decryptionKey={decryptionKey || undefined}
      >
        {(live) => <StealthStreamApp connection={connection} live={live} />}
      </LiveEercBridge>
    </Suspense>
  );
}

function eercKeyName(wallet: string) {
  return `stealthstream:eerc-key:${avalancheFuji.id}:${eercAddress}:${wallet.toLowerCase()}`;
}

function pendingRegistryRecordKey(wallet: string) {
  return `stealthstream:pending-registry:${avalancheFuji.id}:${wallet.toLowerCase()}`;
}

function StealthStreamApp({ connection, live }: { connection: ConnectState; live?: LiveActions }) {
  const [route, setRoute] = useState(window.location.pathname || "/");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const page =
    route === "/tip" ? <TipPage connection={connection} live={live} /> :
    route === "/dashboard" ? <Dashboard connection={connection} live={live} /> :
    route === "/settings" ? <Settings connection={connection} live={live} /> :
    route === "/auditor" ? <Auditor connection={connection} live={live} /> :
    route === "/how-it-works" ? <HowItWorks /> :
    <Landing />;

  return (
    <>
      <Nav connection={connection} open={menuOpen} setOpen={setMenuOpen} />
      {appMode === "live" && !isLiveConfigReady ? <LiveConfigWarning /> : null}
      {appMode === "live" && connection.wallet && !connection.isCorrectChain ? (
        <div className="banner">
          Connected to the wrong network.
          <button onClick={connection.switchToFuji}>Switch to Fuji</button>
        </div>
      ) : null}
      {page}
      <Footer />
    </>
  );
}

function Nav({ connection, open, setOpen }: { connection: ConnectState; open: boolean; setOpen: (v: boolean) => void }) {
  const links = [["Discover", "/"], ["Tip", "/tip"], ["Creator studio", "/dashboard"], ["How it works", "/how-it-works"]];
  return (
    <header className="nav">
      <button className="brand" onClick={() => navTo("/")}>
        <span className="logo"><Radar size={20} /></span><span>stealth<span>stream</span></span>
      </button>
      <nav className={open ? "navlinks open" : "navlinks"}>
        {links.map(([label, href]) => <button key={href} onClick={() => { navTo(href); setOpen(false); }}>{label}</button>)}
      </nav>
      <div className="navactions">
        <span className={connection.mode === "live" && connection.isLiveReady ? "live-pill" : "demo-pill"}><i />{connection.status}</span>
        <button className="wallet-btn" onClick={connection.wallet ? connection.disconnect : connection.connect}>
          <Wallet size={16} />{connection.wallet ? shortAddress(connection.wallet) : "Connect wallet"}
        </button>
        <button className="menu" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </div>
    </header>
  );
}

function LiveConfigWarning() {
  return (
    <div className="banner">
      Live mode is selected, but configuration is incomplete: {missingLiveConfig.join(", ")}.
    </div>
  );
}

function Landing() {
  return (
    <main>
      <section className="hero grid-bg">
        <a className="eyebrow" href="https://build.avax.network/events/b5e9fe35-5b5d-4fac-8709-e8eac8a1eaee" target="_blank" rel="noreferrer" aria-label="Open the Speedrun: Privacy on Avalanche event page"><Sparkles size={15} /> Built for Speedrun: Privacy on Avalanche</a>
        <h1>Tip creators.<br /><em>Stay private.</em></h1>
        <p className="hero-copy">A confidential creator-payment layer with eERC encrypted transfers, Fuji deployment tooling, and permissioned L1 templates.</p>
        <div className="hero-actions">
          <button className="primary" onClick={() => navTo("/tip")}>Send a stealth tip <ArrowRight size={17} /></button>
          <button className="secondary" onClick={() => navTo("/dashboard")}>I am a creator <ChevronRight size={17} /></button>
        </div>
        <div className="privacy-strip">
          <div><Lock size={18} /><span><strong>Encrypted amounts</strong><small>Official eERC SDK</small></span></div>
          <div><UserCheck size={18} /><span><strong>Fuji ready</strong><small>Hardhat deployment path</small></span></div>
          <div><ShieldCheck size={18} /><span><strong>Audit aware</strong><small>Consent metadata and auditor flow</small></span></div>
        </div>
      </section>
      <section className="proof-section">
        <div className="section-intro"><span className="kicker">PRIVATE BY DESIGN</span><h2>Public rails. Private rewards.</h2><p>StealthStream keeps creator revenue private without pretending compliance does not exist.</p></div>
        <div className="feature-grid">
          <Feature icon={<EyeOff />} title="Amounts stay shielded" text="Live mode sends encrypted transfers with the official Ava Labs eERC SDK." />
          <Feature icon={<Lock />} title="Registry records metadata" text="The registry links a creator handle to an encrypted transfer hash, never to a plaintext amount." />
          <Feature icon={<ShieldCheck />} title="Human-gated compliance" text="Creators can record auditor consent; cryptographic auditor setup remains the eERC contract owner's action." />
        </div>
      </section>
      <section className="creator-spotlight">
        <div><span className="kicker">BUILT FOR THE PEOPLE WHO CREATE</span><h2>Creators should own their numbers.</h2><p>Your audience can support you without turning your income into public data.</p><button className="text-btn" onClick={() => navTo("/how-it-works")}>See the privacy stack <ArrowRight size={16} /></button></div>
        <div className="tip-card mini"><div className="tip-card-head"><span className="avatar green">AV</span><span><strong>@alice_streams</strong><small>Gaming and live</small></span><span className="protected"><Lock size={12} /> Shielded</span></div><div className="tip-amount"><span>Private tip</span><strong>Encrypted USDC.e</strong></div><div className="tip-card-footer"><span>Encrypted on Avalanche</span><Check size={16} /></div></div>
      </section>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <article className="feature"><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{text}</p></article>;
}

function TipPage({ connection, live }: { connection: ConnectState; live?: LiveActions }) {
  const [handle, setHandle] = useState(connection.mode === "live" ? "" : "@alice_streams");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("50");
  const [reveal, setReveal] = useState(false);
  const [state, setState] = useState<"idle" | "registering" | "encrypting" | "recording" | "success">("idle");
  const [error, setError] = useState("");
  const [lastTx, setLastTx] = useState<string>("");
  const selected = demoCreators.find((creator) => creator.handle === handle);

  // In Live Mode, resolve the recipient from the deployed Fuji registry so
  // users never need to copy a creator's wallet address by hand.
  useEffect(() => {
    let cancelled = false;
    const normalizedHandle = handle.trim();

    if (connection.mode !== "live" || !live || !registryAddress || !normalizedHandle) {
      if (connection.mode === "live" && !normalizedHandle) setRecipient("");
      return () => { cancelled = true; };
    }

    void (async () => {
      try {
        const resolved = await live.publicClient.readContract({
          address: registryAddress,
          abi: stealthTipRegistryAbi,
          functionName: "creatorForHandle",
          args: [normalizedHandle],
        }) as Address;
        if (!cancelled) setRecipient(resolved === zeroAddress ? "" : resolved);
      } catch {
        if (!cancelled) setRecipient("");
      }
    })();

    return () => { cancelled = true; };
  }, [connection.mode, handle, live]);

  const submit = async () => {
    if (!connection.wallet) {
      await connection.connect();
      return;
    }
    if (connection.mode === "live" && !connection.isCorrectChain) {
      await connection.switchToFuji();
      return;
    }
    if (!Number(amount) || Number(amount) <= 0) {
      setError("Enter a valid tip amount.");
      return;
    }

    try {
      setError("");
      if (connection.mode === "demo") {
        setState("encrypting");
        setTimeout(() => {
          setLastTx("0x9e1b3c4a7ef6d850eecc18a1e3a64db879dcf7001a1a1234567890abcdef1234");
          setState("success");
        }, 1100);
        return;
      }

      if (!live || !registryAddress || !eercAddress) {
        throw new Error("Live mode needs deployed registry, eERC contract, and circuit URLs.");
      }

      const pendingKey = pendingRegistryRecordKey(connection.wallet);
      const pendingRaw = window.localStorage.getItem(pendingKey);
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw) as { handle: string; reference: `0x${string}`; reveal: boolean };
        setState("recording");
        const registryTx = await live.writeContractAsync({
          address: registryAddress,
          abi: stealthTipRegistryAbi,
          functionName: "recordTip",
          args: [pending.handle, pending.reference, pending.reveal],
          chainId: avalancheFuji.id,
        });
        await live.publicClient.waitForTransactionReceipt({ hash: registryTx });
        window.localStorage.removeItem(pendingKey);
        setLastTx(registryTx);
        setState("success");
        return;
      }
      if (!isAddress(recipient)) {
        throw new Error("Enter the creator recipient wallet address for the eERC transfer.");
      }
      const registryCreator = await live.publicClient.readContract({
        address: registryAddress,
        abi: stealthTipRegistryAbi,
        functionName: "creatorForHandle",
        args: [handle],
      }) as Address;
      if (registryCreator === zeroAddress) {
        throw new Error("This creator handle is not registered on the deployed Fuji registry.");
      }
      if (registryCreator.toLowerCase() !== recipient.toLowerCase()) {
        throw new Error("The eERC recipient must match the wallet that owns this creator handle in StealthTipRegistry.");
      }
      if (!live.eerc.isRegistered) {
        throw new Error(
          "This wallet is not registered on StealthStream's eERC deployment. Register it in the matching Builder Console deployment wizard first, then refresh this page. Do not use the generic Console Register Keys page: it is currently pointing at a different Registrar.",
        );
      }

      setState("encrypting");
      const decimals = Number(live.encryptedBalance.decimals || 6n);
      const transfer = await live.encryptedBalance.privateTransfer(
        recipient,
        parseUnits(amount, decimals),
        `StealthStream tip for ${handle}`,
      );
      await live.publicClient.waitForTransactionReceipt({ hash: transfer.transactionHash });

      setState("recording");
      const reference = keccak256(stringToHex(transfer.transactionHash));
      window.localStorage.setItem(pendingKey, JSON.stringify({ handle, reference, reveal }));
      const registryTx = await live.writeContractAsync({
        address: registryAddress,
        abi: stealthTipRegistryAbi,
        functionName: "recordTip",
        args: [handle, reference, reveal],
        chainId: avalancheFuji.id,
      });
      await live.publicClient.waitForTransactionReceipt({ hash: registryTx });

      window.localStorage.removeItem(pendingKey);
      setLastTx(registryTx);
      live.encryptedBalance.refetchBalance();
      setState("success");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to complete the stealth tip.";
      setError(message);
      setState("idle");
    }
  };

  return (
    <main className="page">
      <div className="page-heading"><span className="kicker">SEND SUPPORT PRIVATELY</span><h1>Send a stealth tip</h1><p>In live mode, the encrypted transfer is sent first, then the registry stores the transfer reference.</p></div>
      <div className="tip-layout">
        <section className="form-card">
          {state === "success" ? <Success handle={handle} amount={amount} tx={lastTx} reset={() => setState("idle")} /> : (
            <>
              <label>Creator handle <span className="muted">Registry metadata</span><div className="input-wrap"><Search size={17} /><input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@creator" /></div></label>
              {selected && <div className="creator-preview"><span className="avatar">{selected.avatar}</span><span><strong>{selected.handle}</strong><small>{selected.name} - {selected.category}</small></span><Check size={17} /></div>}
              {connection.mode === "live" && <label>Creator wallet <span className="muted">eERC recipient</span><div className="input-wrap"><Wallet size={16} /><input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x..." /></div></label>}
              <label>Tip amount <span className="muted">Encrypted token units</span><div className="amount-input"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /><span>eERC</span></div></label>
              <div className="quick-amounts">{["10", "25", "50", "100"].map((value) => <button key={value} onClick={() => setAmount(value)} className={amount === value ? "active" : ""}>{value} eERC</button>)}</div>
              <button className={reveal ? "reveal-toggle on" : "reveal-toggle"} onClick={() => setReveal(!reveal)}><span className="toggle-dot" /><span><strong>Share my handle</strong><small>{reveal ? "The creator can associate this tip with you" : "The registry marks the sender as unrevealed"}</small></span></button>
              {connection.mode === "live" && live && !live.eerc.isRegistered ? <p className="warning">Your wallet must register with the eERC contract before it can send encrypted transfers.</p> : null}
              {error && <p className="error">{error}</p>}
              <button className="primary full" onClick={submit} disabled={state !== "idle"}>
                {state === "registering" ? <><span className="spinner" /> Registering encrypted wallet</> :
                  state === "encrypting" ? <><span className="spinner" /> Creating eERC transfer</> :
                  state === "recording" ? <><span className="spinner" /> Recording registry proof</> :
                  <><Lock size={17} /> {connection.wallet ? "Send stealth tip" : "Connect to send"}</>}
              </button>
              <p className="form-foot"><ShieldCheck size={14} /> Demo mode simulates; live mode uses MetaMask, Fuji, eERC, and the registry contract.</p>
            </>
          )}
        </section>
        <aside className="side-note"><span className="side-icon"><EyeOff /></span><h3>What the registry sees</h3><div className="cipher">creator handle<br />keccak256(eERC tx hash)<br />sender reveal flag</div><p>No plaintext tip amount is stored in StealthTipRegistry.</p><div className="chain-label"><Zap size={14} /> Avalanche Fuji - eERC</div></aside>
      </div>
    </main>
  );
}

function Success({ handle, amount, tx, reset }: { handle: string; amount: string; tx: string; reset: () => void }) {
  return <div className="success"><span className="success-icon"><Check /></span><span className="kicker">CONFIDENTIAL FLOW COMPLETE</span><h2>Stealth tip sent.</h2><p><strong>{amount} encrypted units</strong> are now linked to <strong>{handle}</strong>.</p><div className="tx-box"><span>Transaction</span><a href={`${fujiExplorer}/tx/${tx}`} target="_blank" rel="noreferrer">{shortAddress(tx)} <ArrowRight size={13} /></a></div><button className="secondary full" onClick={reset}>Send another tip</button></div>;
}

function Dashboard({ connection, live }: { connection: ConnectState; live?: LiveActions }) {
  const [decrypted, setDecrypted] = useState(false);
  const [registered, setRegistered] = useState(true);
  const [handle, setHandle] = useState("");
  const liveBalance = live?.encryptedBalance.parsedDecryptedBalance;
  const balanceText = connection.mode === "live" && liveBalance ? `${liveBalance} eERC` : "$1,247.50";

  if (!connection.wallet) {
    return <main className="access-page"><span className="access-lock"><Lock /></span><h1>Your private studio awaits.</h1><p>Connect your wallet to decrypt earnings and manage your creator profile.</p><button className="primary" onClick={connection.connect}><Wallet size={17} /> Connect creator wallet</button><small>{connection.mode === "demo" ? "Demo mode grants a simulated approved wallet." : "Live mode requires MetaMask on Fuji."}</small></main>;
  }

  if (!registered) {
    return <main className="page narrow"><div className="page-heading"><span className="kicker">CREATOR ONBOARDING</span><h1>Claim your private studio.</h1><p>After deployment, the admin must approve your wallet before this contract call can succeed.</p></div><section className="form-card"><label>Creator handle <div className="input-wrap"><span>@</span><input value={handle} onChange={(event) => setHandle(event.target.value.replace("@", ""))} placeholder="your_handle" /></div></label><button className="primary full" disabled={!handle} onClick={() => setRegistered(true)}>Claim handle <ArrowRight size={16} /></button></section></main>;
  }

  return (
    <main className="page">
      <div className="dashboard-head"><div><span className="kicker">CREATOR STUDIO</span><h1>Your private creator studio.</h1><p>{connection.mode === "live" ? "Encrypted creator payments and authorized reporting on Avalanche Fuji." : "A wallet-free walkthrough using clearly labeled sample data."}</p></div><div className="head-actions"><button className="secondary" onClick={() => navTo("/settings")}>{connection.mode === "live" ? "Wallet & audit settings" : "Tax mode"}</button>{connection.mode !== "live" && <button className="primary small" onClick={() => setRegistered(false)}>New profile</button>}</div></div>
      <div className="earnings-grid">
        <section className="earnings-card"><div className="card-top"><span>{connection.mode === "live" ? "Live encrypted balance" : "July earnings"}</span><span className="encrypted-tag"><Lock size={12} /> eERC encrypted</span></div><div className={decrypted ? "earnings-value revealed" : "earnings-value"}>{decrypted ? balanceText : "Encrypted"}</div><div className="earnings-bottom"><span>{decrypted ? "Decrypted locally in your browser" : "Decrypt to reveal your balance"}</span><button onClick={() => setDecrypted(!decrypted)}>{decrypted ? <><EyeOff size={15} /> Hide</> : <><Eye size={15} /> Decrypt earnings</>}</button></div></section>
        {connection.mode === "live" ? <section className="chart-card"><div className="card-top"><span>Verified reporting</span><span className="encrypted-tag"><ShieldCheck size={12} /> live</span></div><div className="earnings-value revealed" style={{ fontSize: 25, letterSpacing: -1, marginBottom: 12 }}>Auditor ready</div><p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>Live creator income is intentionally not replaced with fake analytics. Open the auditor report to decrypt verified eERC transfers.</p><button className="text-btn" onClick={() => navTo("/auditor")}>Open verified report <ArrowRight size={15} /></button></section> : <section className="chart-card"><div className="card-top"><span>Private earnings trend</span><span className="muted">Demo analytics</span></div><ResponsiveContainer width="100%" height={170}><AreaChart data={chartData}><defs><linearGradient id="earnings" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#00e687" stopOpacity={0.4} /><stop offset="100%" stopColor="#00e687" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#68707d", fontSize: 11 }} /><YAxis hide /><Tooltip contentStyle={{ background: "#141821", border: "1px solid #2a303d", borderRadius: 10 }} /><Area type="monotone" dataKey="value" stroke="#00e687" strokeWidth={2} fill="url(#earnings)" /></AreaChart></ResponsiveContainer></section>}
      </div>
      <section className="tips-section"><div className="section-row"><div><h2>Recent support</h2><p>{connection.mode === "live" ? "Live payment amounts are available only through the authorized eERC audit view." : "Demo records for a wallet-free walkthrough."}</p></div><button className="text-btn" onClick={() => navTo("/auditor")}>Audit report <ArrowRight size={15} /></button></div>{connection.mode === "live" ? <section className="form-card"><span className="kicker">LIVE DATA BOUNDARY</span><p className="muted" style={{ margin: "12px 0 0", lineHeight: 1.7 }}>StealthStream does not fabricate a public activity feed in Live Mode. Use the auditor portal to view the confirmed encrypted eERC transfer permitted to the configured auditor.</p></section> : <TipsTable decrypted={decrypted} />}</section>
    </main>
  );
}

function TipsTable({ decrypted, tips = demoTips, unit = "USD" }: { decrypted: boolean; tips?: Tip[]; unit?: "USD" | "eERC" }) {
  return <div className="tips-table"><div className="tip-row header-row"><span>Supporter</span><span>Amount</span><span>Time</span><span>Transaction</span></div>{tips.map((tip) => <div className="tip-row" key={tip.id}><span className="supporter"><span className="tiny-avatar">{tip.revealed ? tip.sender.slice(1, 3).toUpperCase() : <Lock size={12} />}</span>{tip.revealed ? tip.sender : "Private supporter"}</span><span className={decrypted ? "amount shown" : "amount"}>{decrypted && tip.amount ? unit === "eERC" ? `${tip.amount} eERC` : `$${tip.amount.toFixed(2)}` : <><Lock size={12} /> Encrypted</>}</span><span>{tip.date}</span><a href={`${fujiExplorer}/tx/${tip.tx}`} target="_blank" rel="noreferrer">{tip.tx}</a></div>)}</div>;
}

function Settings({ connection, live }: { connection: ConnectState; live?: LiveActions }) {
  const [tax, setTax] = useState(false);
  const [auditor, setAuditor] = useState("0xB4a7C6E952d347C1c0fE980A98ccB2A1DDc7e917");
  const [saved, setSaved] = useState(false);
  const [mintRecipient, setMintRecipient] = useState("");
  const [mintAmount, setMintAmount] = useState("1000");
  const [mintStatus, setMintStatus] = useState("");
  const [unlockStatus, setUnlockStatus] = useState("");
  const { writeContractAsync } = useWriteContract();

  const saveAuditor = async () => {
    if (connection.mode === "demo") {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return;
    }
    if (!registryAddress || !isAddress(auditor)) return;
    await writeContractAsync({ address: registryAddress, abi: stealthTipRegistryAbi, functionName: "rotateAuditor", args: [auditor], chainId: avalancheFuji.id });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const mintTestTokens = async () => {
    if (!live || !isAddress(mintRecipient) || !Number(mintAmount) || Number(mintAmount) <= 0) {
      setMintStatus("Enter a valid registered recipient wallet and a positive amount.");
      return;
    }
    if (!connection.wallet || connection.wallet.toLowerCase() !== live.eerc.owner.toLowerCase()) {
      setMintStatus(`Private mint is an owner-only eERC action. Switch MetaMask to the eERC owner ${shortAddress(live.eerc.owner)}, then enter the registered sender wallet as the recipient.`);
      return;
    }
    try {
      setMintStatus("Generating the official EncryptedERC mint proof...");
      const decimals = Number(live.encryptedBalance.decimals || 2n);
      const { createOfficialMintProof, eercPrivateMintAbi } = await import("./official-eerc-mint");
      const proof = await createOfficialMintProof({
        publicClient: live.publicClient,
        eercAddress: eercAddress!,
        recipient: mintRecipient,
        amount: parseUnits(mintAmount, decimals),
        circuit: circuitURLs.mint,
      });
      setMintStatus("Proof generated. Confirm the Fuji private-mint transaction in MetaMask...");
      const transactionHash = await live.writeContractAsync({
        address: eercAddress!,
        abi: eercPrivateMintAbi,
        functionName: "privateMint",
        args: [mintRecipient, proof],
        chainId: avalancheFuji.id,
      });
      const receipt = await live.publicClient.waitForTransactionReceipt({ hash: transactionHash });
      if (receipt.status !== "success") throw new Error("The private-mint transaction reverted on Fuji.");
      setMintStatus(`Private mint confirmed: ${transactionHash}`);
    } catch (caught) {
      setMintStatus(caught instanceof Error ? caught.message : "Private mint failed.");
    }
  };

  const unlockEncryptedWallet = async () => {
    if (!live || !connection.wallet) return;
    if (!live.eerc.isRegistered) {
      setUnlockStatus("This wallet is not registered with this eERC deployment yet.");
      return;
    }
    try {
      setUnlockStatus("MetaMask will ask you to sign a message. This is not a transaction and costs no AVAX.");
      const key = await live.eerc.generateDecryptionKey();
      window.localStorage.setItem(eercKeyName(connection.wallet), key);
      setUnlockStatus("Encrypted wallet unlocked. Reloading with your local key...");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (caught) {
      setUnlockStatus(caught instanceof Error ? caught.message : "Unable to unlock this encrypted wallet.");
    }
  };

  if (!connection.wallet) return <Dashboard connection={connection} live={live} />;

  return <main className="page narrow settings"><div className="page-heading"><span className="kicker">CREATOR SETTINGS</span><h1>Compliance, on your terms.</h1><p>Registry auditor metadata is live. The eERC contract owner still controls the cryptographic auditor public key.</p></div><section className="settings-card"><div className="setting-title"><span className="feature-icon"><ShieldCheck /></span><div><h2>Tax mode</h2><p>Record an auditor wallet for your creator profile.</p></div><button className={tax ? "switch active" : "switch"} onClick={() => setTax(!tax)} aria-label="Toggle tax mode"><span /></button></div>{tax && <div className="setting-content"><label>Auditor wallet address<div className="input-wrap"><Wallet size={16} /><input value={auditor} onChange={(event) => setAuditor(event.target.value)} /></div></label><div className="audit-explainer"><UserCheck size={17} /><span><strong>Permission scope</strong><small>Registry metadata cannot itself grant eERC decryption. Use the eERC owner flow for cryptographic auditor setup.</small></span></div><button className="primary" onClick={saveAuditor}>{saved ? <><Check size={16} /> Auditor metadata updated</> : <><ShieldCheck size={16} /> Save auditor metadata</>}</button></div>}</section>{connection.mode === "live" && live && <><section className="settings-card"><div className="setting-title"><span className="feature-icon"><Lock /></span><div><h2>Unlock this encrypted wallet</h2><p>Required once per browser for a wallet registered through the Builder Console.</p></div></div><div className="setting-content">{live.eerc.isDecryptionKeySet ? <p className="warning"><Check size={15} /> This wallet is unlocked in this browser.</p> : <button className="secondary" onClick={unlockEncryptedWallet}>Unlock with MetaMask signature</button>}{unlockStatus && <p className="warning">{unlockStatus}</p>}</div></section><section className="settings-card"><div className="setting-title"><span className="feature-icon"><Sparkles /></span><div><h2>Fund a demo sender</h2><p>Standalone eERC owner action. Mint encrypted test tokens only to a wallet already registered with eERC.</p></div></div><div className="setting-content"><label>Registered sender wallet<div className="input-wrap"><Wallet size={16} /><input value={mintRecipient} onChange={(event) => setMintRecipient(event.target.value)} placeholder="0x..." /></div></label><label>Private token amount<div className="amount-input"><input value={mintAmount} onChange={(event) => setMintAmount(event.target.value)} inputMode="decimal" /><span>eERC</span></div></label><button className="primary" onClick={mintTestTokens}><Sparkles size={16} /> Mint encrypted demo tokens</button>{mintStatus && <p className="warning">{mintStatus}</p>}</div></section></>}<section className="danger-card"><div><h3>Revoke auditor access</h3><p>Set the registry auditor address back to zero after deployment with the same creator wallet.</p></div><button onClick={() => { setTax(false); setSaved(false); }}>Revoke access</button></section></main>;
}

function Auditor({ connection, live }: { connection: ConnectState; live?: LiveActions }) {
  const [query, setQuery] = useState("@alice_streams");
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [auditorRows, setAuditorRows] = useState<Tip[]>(demoTips);
  const [error, setError] = useState("");
  const total = useMemo(() => auditorRows.reduce((sum, tip) => sum + (tip.amount || 0), 0), [auditorRows]);

  const exportCsv = () => {
    const quote = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["StealthStream confidential auditor report"],
      ["Creator handle", query],
      ["Network", connection.mode === "live" ? "Avalanche Fuji" : "Demo"],
      ["Total reportable income", connection.mode === "live" ? `${total} encrypted units` : `$${total.toFixed(2)} USDC.e`],
      [],
      ["Supporter", "Amount", "Time", "Transaction"],
      ...auditorRows.map((tip) => [tip.sender, tip.amount, tip.date, tip.tx]),
    ];
    const blob = new Blob([rows.map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stealthstream-audit-${query.replace(/[^a-z0-9]/gi, "-") || "report"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const generate = async () => {
    try {
      setError("");
      if (connection.mode === "live" && live) {
        const decrypted = await live.decryptAsCurrentAuditor();
        // A creator tax report counts incoming private transfers, not the
        // owner-funded mint that seeded the demo sender's wallet.
        const incomingTransfers = decrypted.filter((row) =>
          row.type === "Transfer" && row.receiver?.toLowerCase() === connection.wallet?.toLowerCase(),
        );
        const decimals = Number(live.encryptedBalance.decimals ?? 0n);
        setAuditorRows(incomingTransfers.map((row, index) => ({
          id: index + 1,
          sender: row.sender,
          // eERC returns its integer base units. This deployment uses two
          // decimals, so the raw on-chain value 1000 is displayed as 10.
          amount: Number(formatUnits(BigInt(row.amount), decimals)),
          date: "On-chain",
          tx: row.transactionHash,
          revealed: true,
        })));
      }
      setReady(true);
    } catch (caught) {
      setReady(false);
      setError(caught instanceof Error ? caught.message : "Unable to decrypt the auditor report.");
    }
  };

  return <main className="page auditor"><div className="page-heading"><span className="kicker">AUTHORIZED AUDITOR PORTAL</span><h1>Generate a verified report.</h1><p>Live auditor decrypt works only for the eERC contract auditor wallet.</p></div><section className="audit-search"><div className="input-wrap"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} /></div><button className="primary" onClick={generate}><FileDown size={16} /> Generate tax report</button></section>{error && <p className="warning">{error}</p>}{ready && <section className="report"><div className="report-head"><div><span className="kicker">CONFIDENTIAL REPORT</span><h2>{query}</h2><p>{connection.mode === "live" ? "Generated from eERC auditor decrypt" : "Demo report data"}</p></div><button className="secondary" onClick={exportCsv}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Downloaded" : "Export CSV"}</button></div><div className="report-summary"><div><span>Network</span><strong>{connection.mode === "live" ? "Avalanche Fuji" : "Demo"}</strong></div><div><span>Verified transactions</span><strong>{auditorRows.length} private tips</strong></div><div><span>Total reportable income</span><strong>{connection.mode === "live" ? `${total} encrypted units` : `$${total.toFixed(2)} USDC.e`}</strong></div></div><TipsTable decrypted tips={auditorRows} unit={connection.mode === "live" ? "eERC" : "USD"} /></section>}</main>;
}

function HowItWorks() {
  return <main className="page how"><div className="page-heading center"><span className="kicker">TWO LAYERS OF PRIVACY</span><h1>Private data. Private access.</h1><p>StealthStream separates confidential value transfer from public registry metadata.</p></div><div className="comparison"><section className="public-side"><span className="comparison-label">ORDINARY PUBLIC TIP</span><h2>Every observer sees the payment.</h2><div className="public-tx"><span>From <strong>0x71A2...A81A</strong></span><span>To <strong>0x1CE...00B</strong></span><strong className="public-amount">50.00 USDC</strong><small>Visible on a public explorer forever</small></div></section><section className="private-side"><span className="comparison-label">STEALTHSTREAM TIP</span><h2>Only the right people see the amount.</h2><div className="private-tx"><Lock size={25} /><code>eERC transfer hash + registry reference</code><small>Plaintext amount is not stored in the registry</small></div></section></div><section className="stack"><div className="stack-card"><span className="stack-number">01</span><Lock /><h3>eERC protects the value</h3><p>Tip amounts and balances use encrypted token transfers and zero-knowledge proofs.</p></div><div className="stack-connector"><ArrowRight /></div><div className="stack-card"><span className="stack-number">02</span><UserCheck /><h3>Fuji proves the flow</h3><p>The included deployment scripts target Avalanche Fuji for the hackathon submission.</p></div><div className="stack-connector"><ArrowRight /></div><div className="stack-card"><span className="stack-number">03</span><ShieldCheck /><h3>L1 template protects access</h3><p>The optional permissioned L1 genesis template includes transaction and contract deployer allowlists.</p></div></section></main>;
}

function Footer() {
  return <footer><button className="brand" onClick={() => navTo("/")}><span className="logo"><Radar size={17} /></span><span>stealth<span>stream</span></span></button><span>Private creator support on Avalanche</span><span>Fuji testnet - eERC - Permissioned L1 template</span></footer>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><AppRoot /></React.StrictMode>);
