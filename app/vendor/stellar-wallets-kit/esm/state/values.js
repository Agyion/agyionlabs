import { computed, signal } from "@preact/signals";
import { LocalStorageKeys, Networks, SwkAppLightTheme, SwkAppMode, SwkAppRoute, } from "../types/mod.js";
const localstorage = globalThis.localStorage;
///////////////////////////////////
/// Configuration state signals ///
///////////////////////////////////
export const mode = signal(SwkAppMode.FIXED);
export const modalTitle = signal("Connect a Wallet");
export const showInstallLabel = signal(true);
export const hideUnsupportedWallets = signal(true);
export const installText = signal("Install");
export const horizonUrl = signal("https://horizon.stellar.org");
export const selectedNetwork = signal(Networks.PUBLIC);
export const theme = signal(SwkAppLightTheme);
///////////////////////////////////
///      App state signals      ///
///////////////////////////////////
export const route = signal(SwkAppRoute.AUTH_OPTIONS);
export const routerHistory = signal([SwkAppRoute.AUTH_OPTIONS]);
///////////////////////////////////
///    Wallets state signals    ///
///////////////////////////////////
export const activeAddress = signal(localstorage?.getItem(LocalStorageKeys.activeAddress) || undefined);
export const selectedModuleId = signal(localstorage?.getItem(LocalStorageKeys.selectedModuleId) || undefined);
export const allowedWallets = signal([]);
export const activeModules = signal([]);
export const activeModule = computed(() => {
    return activeModules.value
        .find((m) => m.productId === selectedModuleId.value);
});
// Cached provider metadata is untrusted and is never signing authority.
function readCachedPaths(key, valid) {
    try {
        const raw = localstorage?.getItem(key);
        if (!raw || raw.length > 65536) return [];
        const value = JSON.parse(raw);
        return Array.isArray(value) && value.length <= 128 && value.every(valid) ? value : [];
    } catch { return []; }
}
const cachedAccount = (value) => typeof value === "string" && /^G[A-Z2-7]{55}$/.test(value);
const cachedRow = (row, field) => row !== null && typeof row === "object" && !Array.isArray(row) &&
    Object.keys(row).length === 2 && Object.hasOwn(row, "publicKey") && Object.hasOwn(row, field) && cachedAccount(row.publicKey);
export const hardwareWalletPaths = signal(readCachedPaths(LocalStorageKeys.hardwareWalletPaths, (row) =>
    cachedRow(row, "index") && Number.isInteger(row.index) && row.index >= 0 && row.index < 2147483648));
export const mnemonicPath = computed(() => {
    const path = hardwareWalletPaths.value.find(({ publicKey }) => publicKey === activeAddress.value);
    if (!path)
        return undefined;
    return `44'/148'/${path.index}'`;
});
export const wcSessionPaths = signal(readCachedPaths(LocalStorageKeys.wcSessionPaths, (row) =>
    cachedRow(row, "topic") && typeof row.topic === "string" && row.topic.length > 0 && row.topic.length <= 256));
export function resetWalletState() {
    routerHistory.value = [];
    hardwareWalletPaths.value = [];
    wcSessionPaths.value = [];
    activeAddress.value = undefined;
    selectedModuleId.value = undefined;
}
