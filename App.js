import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View
} from "react-native";

import TaskForm from "./src/components/TaskForm";
import TaskCard from "./src/components/TaskCard";
import { DEFAULT_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS, PLATFORM_OPTIONS } from "./src/constants";
import {
  checkCloudTask,
  createCloudTask,
  deleteCloudTask,
  enrichPerformanceCandidateCloud,
  hasServerUrl,
  healthCheck,
  loadCloudTasks,
  searchPerformancesCloud,
  updateCloudTask
} from "./src/services/api";
import {
  configureNotifications,
  getNotificationPermissionStatus,
  presentLocalNotification,
  scheduleCountdownNotifications
} from "./src/services/notifications";
import { loadServerUrl, saveServerUrl } from "./src/services/storage";
import { createTask, formatTime } from "./src/utils/task";

const NO_TICKET_LINK_MESSAGE =
  "未找到可监测的票务平台链接，请尝试搜索：艺人名 + 城市 + 演唱会，例如：邓紫棋 南昌 演唱会 猫眼";

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [busyTaskId, setBusyTaskId] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [serverUrlDraft, setServerUrlDraft] = useState("");
  const [serverStatus, setServerStatus] = useState("未配置");
  const [syncBusy, setSyncBusy] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState("读取中");
  const [clockTick, setClockTick] = useState(0);
  const [notice, setNotice] = useState("只做低频提醒，收到通知后请手动打开对应平台页面或官方 App 操作。");
  const [createMode, setCreateMode] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [resultFilter, setResultFilter] = useState("all");
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [selectingCandidateId, setSelectingCandidateId] = useState("");
  const notifiedRef = useRef(new Set());
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    async function bootstrap() {
      const permission = await configureNotifications();
      setPermissionStatus(formatPermissionStatus(permission?.status || (await getNotificationPermissionStatus())));
      const savedServerUrl = await loadServerUrl();
      setServerUrl(savedServerUrl);
      setServerUrlDraft(savedServerUrl);
      if (hasServerUrl(savedServerUrl)) {
        await syncTasks(savedServerUrl, { silent: true });
      }
    }
    bootstrap();
  }, []);

  const updateTask = useCallback((taskId, patch) => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task))
    );
  }, []);

  const refreshPermissionStatus = useCallback(async () => {
    setPermissionStatus(formatPermissionStatus(await getNotificationPermissionStatus()));
  }, []);

  const notifyCloudHits = useCallback(
    async (nextTasks) => {
      for (const task of nextTasks) {
        const notification = task.notification;
        if (!notification?.id || notifiedRef.current.has(notification.id)) {
          continue;
        }
        notifiedRef.current.add(notification.id);
        Vibration.vibrate([0, 400, 200, 400]);
        await presentLocalNotification({
          title: notification.title || "发现疑似有票/可购买状态",
          body: notification.body || `${task.showName || "演出"} 命中关键词，请手动打开页面或官方 App 确认。`,
          data: { url: task.url, taskId: task.id }
        });
      }
    },
    []
  );

  const syncTasks = useCallback(
    async (url = serverUrl, options = {}) => {
      if (!hasServerUrl(url)) {
        setServerStatus("未配置");
        return [];
      }
      if (!options.silent) {
        setSyncBusy(true);
      }
      try {
        const nextTasks = await loadCloudTasks(url);
        setTasks(nextTasks);
        setServerStatus("已连接云端");
        await notifyCloudHits(nextTasks);
        return nextTasks;
      } catch (error) {
        const message = error?.message || "无法连接云端";
        setServerStatus(message);
        if (!options.silent) {
          Alert.alert("同步失败", message);
        }
        return [];
      } finally {
        if (!options.silent) {
          setSyncBusy(false);
        }
      }
    },
    [notifyCloudHits, serverUrl]
  );

  const runCheck = useCallback(
    async (task, manual = false) => {
      if (busyTaskId === task.id) {
        return;
      }
      if (!hasServerUrl(serverUrl)) {
        Alert.alert("请先配置服务器地址", "开发阶段可以填本地局域网地址，正式使用请填写云端 HTTPS 地址。");
        return;
      }

      setBusyTaskId(task.id);
      try {
        const updated = await checkCloudTask(serverUrl, task.id);
        updateTask(task.id, updated);
        setNotice(`${updated.showName || "任务"}：${updated.lastMessage || updated.lastResult || "检查完成"}`);
        await notifyCloudHits([updated]);
        if (manual) {
          Alert.alert("检查完成", updated.lastMessage || updated.lastResult || "云端检查完成");
        }
      } catch (error) {
        const message = error?.message || "检查失败，请稍后重试";
        if (manual) {
          Alert.alert("检查失败", message);
        }
      } finally {
        setBusyTaskId("");
      }
    },
    [busyTaskId, notifyCloudHits, serverUrl, updateTask]
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setClockTick((value) => value + 1);
      if (hasServerUrl(serverUrl)) {
        syncTasks(serverUrl, { silent: true });
      }
    }, 10000);

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshPermissionStatus();
      }
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        if (hasServerUrl(serverUrl)) {
          syncTasks(serverUrl, { silent: true });
        }
      }
      appState.current = nextState;
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [refreshPermissionStatus, serverUrl, syncTasks]);

  const runningCount = useMemo(() => tasks.filter((task) => task.status === "running").length, [tasks]);
  const visibleSearchResults = useMemo(() => {
    if (resultFilter === "ticket") {
      return searchResults.filter((candidate) => candidate.isTicketPlatform);
    }
    if (resultFilter === "reference") {
      return searchResults.filter((candidate) => !candidate.isTicketPlatform);
    }
    return searchResults;
  }, [resultFilter, searchResults]);
  const formCandidate = createMode === "search" && selectedCandidate?.isTicketPlatform ? selectedCandidate : null;

  async function handleSaveServerUrl() {
    const nextUrl = serverUrlDraft.trim().replace(/\/+$/, "");
    if (!hasServerUrl(nextUrl)) {
      Alert.alert("服务器地址无效", "请输入 http:// 或 https:// 开头的云端地址。");
      return;
    }
    setSyncBusy(true);
    try {
      await healthCheck(nextUrl);
      await saveServerUrl(nextUrl);
      setServerUrl(nextUrl);
      setServerUrlDraft(nextUrl);
      setServerStatus("已连接云端");
      setNotice("服务器地址已保存。正式使用时请连接部署后的云端 HTTPS 地址。");
      await syncTasks(nextUrl, { silent: true });
    } catch (error) {
      setServerStatus(error?.message || "连接失败");
      Alert.alert("连接失败", error?.message || "无法连接服务器");
    } finally {
      setSyncBusy(false);
    }
  }

  async function handleCreate(formValues) {
    if (!hasServerUrl(serverUrl)) {
      Alert.alert("请先配置服务器地址", "开发阶段可以填本地局域网地址，正式使用请填写云端 HTTPS 地址。");
      return;
    }
    try {
      const task = createTask(formValues);
      const runningTask = {
        ...task,
        status: "running",
        nextCheckAt: new Date().toISOString(),
        lastMessage: "监测中，正在准备检查页面",
        lastResult: "监测中，正在准备检查页面"
      };
      const countdownNotificationIds = await scheduleCountdownNotifications(runningTask);
      const savedTask = await createCloudTask(serverUrl, { ...runningTask, countdownNotificationIds });
      setTasks((current) => [savedTask, ...current]);
      setSelectedCandidate(null);
      setNotice(`${savedTask.platformName}任务已提交到云端监测，并已安排开票倒计时本地提醒。`);
    } catch (error) {
      Alert.alert("创建失败", error?.message || "无法创建云端任务");
    }
  }

  async function handleSearch() {
    const query = searchQuery.trim();
    if (!query) {
      Alert.alert("请输入搜索内容", "请输入演出名称、艺人或城市，例如“黎明 ROBBABA 广州”。");
      return;
    }

    setSearchBusy(true);
    setSelectedCandidate(null);
    setSelectingCandidateId("");
    setSearchResults([]);
    setResultFilter("all");
    setNotice("正在广泛搜索演出信息，并单独补搜猫眼、大麦、B站会员购和美团票务链接。");

    try {
      if (!hasServerUrl(serverUrl)) {
        Alert.alert("请先配置服务器地址", "搜索由云端后端完成，请先填写服务器地址。");
        return;
      }
      const results = await searchPerformancesCloud(serverUrl, query);
      setSearchResults(results);
      if (results.length === 0) {
        setNotice(NO_TICKET_LINK_MESSAGE);
        Alert.alert("搜索失败", NO_TICKET_LINK_MESSAGE);
        return;
      }
      if (!results.some((candidate) => candidate.isTicketPlatform)) {
        setNotice(NO_TICKET_LINK_MESSAGE);
        Alert.alert("未找到票务平台链接", NO_TICKET_LINK_MESSAGE);
        return;
      }
      setNotice(`找到 ${results.length} 个候选，已优先显示可监测的票务平台链接。`);
    } catch {
      setNotice(NO_TICKET_LINK_MESSAGE);
      Alert.alert("搜索失败", NO_TICKET_LINK_MESSAGE);
    } finally {
      setSearchBusy(false);
    }
  }

  async function handleSelectCandidate(candidate) {
    if (!candidate?.isTicketPlatform) {
      await handleOpenReference(candidate);
      return;
    }

    setSelectingCandidateId(candidate.id);
    setSelectedCandidate(null);
    setNotice("正在解析公开详情页中的城市、场馆、场次和票档。");

    try {
      const enriched = await enrichPerformanceCandidateCloud(serverUrl, candidate);
      setSelectedCandidate(enriched);
      setSearchResults((current) => current.map((item) => (item.id === candidate.id ? enriched : item)));
      setNotice("已进入选择监测信息页面，请选择城市、场馆、场次和票档后开始监测。");
    } catch {
      setSelectedCandidate(candidate);
      setNotice("详情解析不完整，请在选择监测信息页面补充缺失字段。");
    } finally {
      setSelectingCandidateId("");
    }
  }

  async function handleOpenReference(candidate) {
    const url = String(candidate?.url || "").trim();
    if (!url) {
      Alert.alert("链接为空", "参考网页链接为空，无法打开。");
      return;
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return;
    }
    Alert.alert("无法打开链接", "请检查参考网页链接是否正确。");
  }

  async function handleToggle(task) {
    if (!hasServerUrl(serverUrl)) {
      Alert.alert("请先配置服务器地址", "任务状态由云端保存，请先填写服务器地址。");
      return;
    }
    const nextStatus = task.status === "running" ? "paused" : "running";
    let countdownNotificationIds = task.countdownNotificationIds || [];
    if (nextStatus === "running") {
      countdownNotificationIds = await scheduleCountdownNotifications(task);
    }
    const updated = await updateCloudTask(serverUrl, task.id, {
      status: nextStatus,
      countdownNotificationIds,
      nextCheckAt: nextStatus === "running" ? new Date().toISOString() : "",
      lastMessage: nextStatus === "running" ? "监测中，正在准备检查页面" : "已暂停",
      lastResult: nextStatus === "running" ? task.lastResult || "尚未检查" : "已暂停"
    });
    updateTask(task.id, updated);
  }

  function handleDelete(task) {
    Alert.alert("删除任务", `确认删除“${task.showName || "未命名演出"}”？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCloudTask(serverUrl, task.id);
            setTasks((current) => current.filter((item) => item.id !== task.id));
          } catch (error) {
            Alert.alert("删除失败", error?.message || "无法删除云端任务");
          }
        }
      }
    ]);
  }

  async function handleOpen(task) {
    if (!String(task.url || "").trim()) {
      Alert.alert("链接为空", `请先填写${task.platformName || "平台"}网页链接。`);
      return;
    }

    const appUrl = String(task.appUrl || "").trim();
    if (appUrl) {
      try {
        await Linking.openURL(appUrl);
        return;
      } catch {
        setNotice(`${task.platformName || "平台"} App 跳转失败，已尝试打开网页链接。`);
      }
    }

    const supported = await Linking.canOpenURL(task.url);
    if (supported) {
      await Linking.openURL(task.url);
      return;
    }
    Alert.alert("无法打开链接", `请检查${task.platformName || "平台"}网页链接是否正确。`);
  }

  async function handleTestReminder() {
    Vibration.vibrate([0, 400, 180, 400]);
    await presentLocalNotification({
      title: "测试提醒",
      body: "通知、震动和 App 内弹窗已触发。真正购票请手动打开对应平台页面或官方 App。",
      data: { type: "test" }
    });
    Alert.alert("测试提醒", "通知、震动和 App 内弹窗已触发。");
    await refreshPermissionStatus();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="always"
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>多平台票务提醒助手</Text>
              <Text style={styles.subtitle}>移动端合规提醒版</Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countNumber}>{runningCount}</Text>
              <Text style={styles.countLabel}>监测中</Text>
            </View>
          </View>

          <View style={styles.complianceBox}>
            <Text style={styles.complianceText}>
              不自动登录、不下单、不点击购买、不绕过验证码、不保存 Cookie；最低检测间隔 {MIN_INTERVAL_SECONDS} 秒。
            </Text>
            <Text style={styles.permissionText}>通知权限：{permissionStatus}</Text>
          </View>

          <View style={styles.serverPanel}>
            <Text style={styles.panelTitle}>服务器地址配置</Text>
            <TextInput
              style={styles.serverInput}
              value={serverUrlDraft}
              onChangeText={setServerUrlDraft}
              placeholder="https://your-backend.example.com"
              placeholderTextColor="#8F9D99"
              keyboardType="url"
              autoCapitalize="none"
            />
            <View style={styles.serverActions}>
              <TouchableOpacity activeOpacity={0.86} style={styles.serverPrimaryButton} onPress={handleSaveServerUrl} disabled={syncBusy}>
                {syncBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                <Text style={styles.serverPrimaryText}>{syncBusy ? "连接中" : "保存并连接"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.86}
                style={styles.serverSecondaryButton}
                onPress={() => syncTasks(serverUrl)}
                disabled={syncBusy || !hasServerUrl(serverUrl)}
              >
                <Text style={styles.serverSecondaryText}>刷新任务</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.serverStatus}>状态：{serverStatus}</Text>
            <Text style={styles.serverHint}>开发可填本地局域网地址；正式使用请只连接云端 HTTPS 地址。</Text>
          </View>

          <TouchableOpacity activeOpacity={0.86} style={styles.testButton} onPress={handleTestReminder}>
            <Text style={styles.testButtonText}>测试提醒</Text>
          </TouchableOpacity>

          <View style={styles.modeSwitch}>
            <ModeButton label="搜索创建" selected={createMode === "search"} onPress={() => setCreateMode("search")} />
            <ModeButton label="手动创建" selected={createMode === "manual"} onPress={() => setCreateMode("manual")} />
          </View>

          {createMode === "search" ? (
            <View style={styles.searchPanel}>
              <Text style={styles.panelTitle}>搜索创建任务</Text>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="输入演出名称 / 艺人 / 城市，例如：黎明 ROBBABA 广州"
                placeholderTextColor="#8F9D99"
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              <TouchableOpacity activeOpacity={0.86} style={styles.searchButton} onPress={handleSearch} disabled={searchBusy}>
                {searchBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                <Text style={styles.searchButtonText}>{searchBusy ? "搜索中" : "搜索演出"}</Text>
              </TouchableOpacity>

              {searchResults.length > 0 ? (
                <>
                  <View style={styles.filterRow}>
                    <FilterButton label="全部" selected={resultFilter === "all"} onPress={() => setResultFilter("all")} />
                    <FilterButton label="票务平台" selected={resultFilter === "ticket"} onPress={() => setResultFilter("ticket")} />
                    <FilterButton label="参考网页" selected={resultFilter === "reference"} onPress={() => setResultFilter("reference")} />
                  </View>
                  <Text style={styles.searchHint}>参考网页可用于识别演出信息，但需要票务平台链接才能监测。</Text>
                  <View style={styles.resultList}>
                    {visibleSearchResults.map((candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        selected={candidate.isTicketPlatform && selectedCandidate?.id === candidate.id}
                        busy={selectingCandidateId === candidate.id}
                        onSelect={() => handleSelectCandidate(candidate)}
                        onOpenReference={() => handleOpenReference(candidate)}
                      />
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}

          {createMode === "manual" || formCandidate ? (
            <TaskForm
              onSubmit={handleCreate}
              initialValues={formCandidate}
              title={formCandidate ? "选择监测信息" : "手动创建任务"}
            />
          ) : null}

          <View style={styles.noticeBar}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>任务列表</Text>
            <Text style={styles.sectionMeta}>{tasks.length} 个任务</Text>
          </View>

          {tasks.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>还没有监测任务</Text>
              <Text style={styles.emptyText}>
                选择平台，新增演出名称、链接、场次、票档和提醒关键词后，可以开始低频监测。
              </Text>
            </View>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                busy={busyTaskId === task.id}
                onToggle={() => handleToggle(task)}
                onDelete={() => handleDelete(task)}
                onOpen={() => handleOpen(task)}
                onCheckNow={() => runCheck(task, true)}
                clockTick={clockTick}
              />
            ))
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              支持平台：{PLATFORM_OPTIONS.map((platform) => platform.name).join("、")}。
            </Text>
            <Text style={styles.footerText}>默认检测间隔：{DEFAULT_INTERVAL_SECONDS} 秒。当前时间：{formatTime(new Date().toISOString())}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeButton({ label, selected, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.84} style={[styles.modeButton, selected && styles.modeButtonSelected]} onPress={onPress}>
      <Text style={[styles.modeButtonText, selected && styles.modeButtonTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FilterButton({ label, selected, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.84} style={[styles.filterButton, selected && styles.filterButtonSelected]} onPress={onPress}>
      <Text style={[styles.filterButtonText, selected && styles.filterButtonTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CandidateCard({ candidate, selected, busy, onSelect, onOpenReference }) {
  const options = candidate.options || {};
  const isTicketPlatform = Boolean(candidate.isTicketPlatform);
  const actionText = isTicketPlatform ? "选择此票务链接" : "查看参考";
  return (
    <View style={[styles.candidateCard, selected && styles.candidateCardSelected]}>
      <View style={styles.candidateTop}>
        <View style={styles.candidateTitleBlock}>
          <Text style={styles.candidateLabel}>演出标题</Text>
          <Text style={styles.candidateTitle} numberOfLines={2}>
            {candidate.showName || "未命名演出"}
          </Text>
        </View>
        <Text style={styles.candidatePlatform}>{candidate.platformName || "其他网页"}</Text>
      </View>
      <View style={styles.candidateGrid}>
        <CandidateInfo label="来源网站" value={candidate.sourceSite || candidate.source || "未知来源"} />
        <CandidateInfo label="平台类型" value={candidate.platformType || (candidate.isTicketPlatform ? "票务平台" : "参考网页")} />
        <CandidateInfo label="城市" value={formatOptionPreview(options.cities, candidate.city)} />
        <CandidateInfo label="场馆" value={formatOptionPreview(options.venues, candidate.venue)} />
        <CandidateInfo label="场次" value={formatOptionPreview(options.sessions, candidate.sessionName)} />
        <CandidateInfo label="票档" value={formatOptionPreview(options.ticketTiers, candidate.ticketTier)} />
        <CandidateInfo label="开票时间" value={candidate.saleTime || "未识别，选择后可补充"} />
      </View>
      <Text style={styles.candidateLinkLabel}>链接</Text>
      <Text style={styles.candidateUrl} numberOfLines={2}>
        {candidate.url}
      </Text>
      <TouchableOpacity
        activeOpacity={0.86}
        style={styles.candidateActionButton}
        onPress={isTicketPlatform ? onSelect : onOpenReference}
        disabled={busy}
      >
        <Text style={styles.candidateAction}>
          {busy ? "正在解析可选项" : selected ? "已进入选择监测信息" : actionText}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function formatOptionPreview(options, fallback) {
  const values = Array.isArray(options) ? options.filter(Boolean) : [];
  if (values.length > 0) {
    return values.slice(0, 3).join("、") + (values.length > 3 ? ` 等 ${values.length} 项` : "");
  }
  return fallback || "未识别，选择后可补充";
}

function CandidateInfo({ label, value }) {
  return (
    <View style={styles.candidateInfo}>
      <Text style={styles.candidateLabel}>{label}</Text>
      <Text style={styles.candidateValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function formatPermissionStatus(status) {
  if (status === "granted") {
    return "已允许";
  }
  if (status === "denied") {
    return "已拒绝，请在系统设置中开启";
  }
  if (status === "undetermined") {
    return "未决定";
  }
  return status || "未知";
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F5F7F6",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0
  },
  flex: {
    flex: 1
  },
  container: {
    padding: 18,
    paddingBottom: 36
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    marginBottom: 14
  },
  title: {
    color: "#14211F",
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 30
  },
  subtitle: {
    color: "#53605D",
    marginTop: 4,
    fontSize: 14
  },
  countPill: {
    minWidth: 72,
    borderRadius: 8,
    backgroundColor: "#176B5D",
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  countNumber: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800"
  },
  countLabel: {
    color: "#DDEBE8",
    fontSize: 12
  },
  complianceBox: {
    backgroundColor: "#E7F2EF",
    borderColor: "#B8D5CF",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14
  },
  complianceText: {
    color: "#244943",
    fontSize: 13,
    lineHeight: 20
  },
  permissionText: {
    color: "#244943",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8
  },
  serverPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE3E1",
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14
  },
  serverInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#C9D3D0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#1C2926",
    backgroundColor: "#FBFCFC",
    fontSize: 15,
    marginBottom: 10
  },
  serverActions: {
    flexDirection: "row",
    gap: 8
  },
  serverPrimaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#176B5D",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  serverPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14
  },
  serverSecondaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D3D0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  serverSecondaryText: {
    color: "#176B5D",
    fontWeight: "800",
    fontSize: 14
  },
  serverStatus: {
    color: "#3D4A47",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10
  },
  serverHint: {
    color: "#687471",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4
  },
  testButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C2D7D1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14
  },
  testButtonText: {
    color: "#176B5D",
    fontSize: 15,
    fontWeight: "800"
  },
  modeSwitch: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14
  },
  modeButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D3D0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  modeButtonSelected: {
    backgroundColor: "#176B5D",
    borderColor: "#176B5D"
  },
  modeButtonText: {
    color: "#3D4A47",
    fontSize: 14,
    fontWeight: "800"
  },
  modeButtonTextSelected: {
    color: "#FFFFFF"
  },
  searchPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DCE3E1",
    padding: 14,
    marginBottom: 14
  },
  panelTitle: {
    color: "#162421",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12
  },
  searchInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#C9D3D0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#1C2926",
    backgroundColor: "#FBFCFC",
    fontSize: 15,
    marginBottom: 10
  },
  searchButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: "#176B5D",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800"
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },
  filterButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D3D0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  filterButtonSelected: {
    borderColor: "#176B5D",
    backgroundColor: "#E2F2EC"
  },
  filterButtonText: {
    color: "#3D4A47",
    fontSize: 13,
    fontWeight: "800"
  },
  filterButtonTextSelected: {
    color: "#176B5D"
  },
  searchHint: {
    color: "#60706C",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10
  },
  resultList: {
    marginTop: 12,
    gap: 10
  },
  candidateCard: {
    borderWidth: 1,
    borderColor: "#D8E0DE",
    borderRadius: 8,
    backgroundColor: "#FBFCFC",
    padding: 12
  },
  candidateCardSelected: {
    borderColor: "#176B5D",
    backgroundColor: "#EDF7F4"
  },
  candidateTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  candidateTitleBlock: {
    flex: 1
  },
  candidateTitle: {
    color: "#172522",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21
  },
  candidatePlatform: {
    color: "#176B5D",
    backgroundColor: "#E2F2EC",
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "800"
  },
  candidateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
    marginTop: 10
  },
  candidateInfo: {
    width: "50%",
    paddingRight: 8
  },
  candidateLabel: {
    color: "#7D8986",
    fontSize: 11,
    marginBottom: 2
  },
  candidateValue: {
    color: "#2B3936",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  candidateUrl: {
    color: "#61716D",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  candidateLinkLabel: {
    color: "#7D8986",
    fontSize: 11,
    marginTop: 10
  },
  candidateAction: {
    color: "#176B5D",
    fontSize: 13,
    fontWeight: "800"
  },
  candidateActionButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8D5CF",
    backgroundColor: "#E2F2EC",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginTop: 10
  },
  noticeBar: {
    backgroundColor: "#202928",
    borderRadius: 8,
    padding: 12,
    marginTop: 14,
    marginBottom: 20
  },
  noticeText: {
    color: "#F3F7F6",
    fontSize: 13,
    lineHeight: 20
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  sectionTitle: {
    color: "#182321",
    fontSize: 18,
    fontWeight: "800"
  },
  sectionMeta: {
    color: "#6B7774",
    fontSize: 13
  },
  empty: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D7DEDC",
    backgroundColor: "#FFFFFF",
    padding: 18
  },
  emptyTitle: {
    color: "#202928",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6
  },
  emptyText: {
    color: "#66716E",
    lineHeight: 21
  },
  footer: {
    marginTop: 20,
    gap: 6
  },
  footerText: {
    color: "#6C7775",
    fontSize: 12,
    lineHeight: 18
  }
});
