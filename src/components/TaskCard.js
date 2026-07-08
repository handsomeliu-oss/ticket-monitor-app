import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatTime, secondsUntilNextCheck } from "../utils/task";

export default function TaskCard({ task, busy, onToggle, onDelete, onOpen, onCheckNow }) {
  const nextSeconds = secondsUntilNextCheck(task);
  const statusText = task.status === "running" ? "监测中" : "已暂停";
  const nextText =
    nextSeconds === null
      ? "未运行"
      : nextSeconds === 0
        ? "即将检查"
        : task.nextCheckAt
          ? formatTime(task.nextCheckAt)
          : `${Math.ceil(nextSeconds / 60)} 分钟内检查`;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={2}>
            {task.showName || "未命名演出"}
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {task.sessionName || "未填场次"} / {task.ticketTier || "未填票档"}
          </Text>
        </View>
        <View style={[styles.statusPill, task.status === "running" ? styles.running : styles.paused]}>
          <Text style={[styles.statusText, task.status === "running" ? styles.runningText : styles.pausedText]}>
            {statusText}
          </Text>
        </View>
      </View>

      <View style={styles.infoGrid}>
        <Info label="平台" value={task.platformName || "猫眼"} />
        <Info label="城市" value={task.city || "未填写"} />
        <Info label="场馆" value={task.venue || "未填写"} />
        <Info label="演出名称" value={task.showName || "未命名演出"} />
        <Info label="场次" value={task.sessionName || "未填场次"} />
        <Info label="票档" value={task.ticketTier || "未填票档"} />
        <Info label="开票时间" value={task.saleTime || "未填写"} />
        <Info label="检测间隔" value={`${task.intervalSeconds} 秒`} />
        <Info label="上次检查" value={formatTime(task.lastCheckedAt)} />
        <Info label="下次检查" value={nextText} />
      </View>

      <Text style={styles.message}>{task.lastResult || task.lastMessage || "尚未检查"}</Text>

      <Text style={styles.keywords} numberOfLines={2}>
        关键词：{(task.keywords || []).join("、")}
      </Text>

      <View style={styles.actions}>
        <ActionButton label={task.status === "running" ? "暂停" : "开始"} onPress={onToggle} tone="primary" />
        <ActionButton label="检查" onPress={onCheckNow} disabled={busy} />
        <ActionButton label="打开链接/App" onPress={onOpen} />
        <ActionButton label="删除" onPress={onDelete} tone="danger" />
      </View>

      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color="#176B5D" />
          <Text style={styles.busyText}>正在低频检测页面状态...</Text>
        </View>
      ) : null}
    </View>
  );
}

function Info({ label, value }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ActionButton({ label, onPress, tone, disabled }) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={[
        styles.actionButton,
        tone === "primary" && styles.primaryButton,
        tone === "danger" && styles.dangerButton,
        disabled && styles.disabledButton
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.actionText,
          tone === "primary" && styles.primaryText,
          tone === "danger" && styles.dangerText,
          disabled && styles.disabledText
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DCE3E1",
    padding: 14,
    marginBottom: 12
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10
  },
  titleWrap: {
    flex: 1
  },
  title: {
    color: "#15211F",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 23
  },
  meta: {
    color: "#5F6D69",
    fontSize: 13,
    marginTop: 4
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  running: {
    backgroundColor: "#E2F2EC"
  },
  paused: {
    backgroundColor: "#EEF1F0"
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800"
  },
  runningText: {
    color: "#176B5D"
  },
  pausedText: {
    color: "#65706D"
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    rowGap: 10
  },
  infoItem: {
    width: "50%",
    paddingRight: 8
  },
  infoLabel: {
    color: "#7D8986",
    fontSize: 12,
    marginBottom: 3
  },
  infoValue: {
    color: "#263330",
    fontSize: 13,
    fontWeight: "700"
  },
  message: {
    color: "#24312E",
    backgroundColor: "#F4F7F6",
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    lineHeight: 20
  },
  keywords: {
    color: "#687471",
    fontSize: 12,
    marginTop: 10,
    lineHeight: 18
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D3D0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  primaryButton: {
    backgroundColor: "#176B5D",
    borderColor: "#176B5D"
  },
  dangerButton: {
    borderColor: "#E5B5AD",
    backgroundColor: "#FFF8F7"
  },
  actionText: {
    color: "#31413D",
    fontWeight: "800",
    fontSize: 13
  },
  primaryText: {
    color: "#FFFFFF"
  },
  dangerText: {
    color: "#B53B2F"
  },
  disabledText: {
    color: "#98A29F"
  },
  disabledButton: {
    opacity: 0.62
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12
  },
  busyText: {
    color: "#53615D",
    fontSize: 12
  }
});
