import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { parseSaleTime } from "../utils/task";

const CHANNEL_ID = "ticket-alerts";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export async function configureNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "票务提醒",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#176B5D"
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status !== "granted") {
    return Notifications.requestPermissionsAsync();
  }
  return existing;
}

export async function getNotificationPermissionStatus() {
  const permission = await Notifications.getPermissionsAsync();
  return permission.status || "undetermined";
}

export async function presentLocalNotification({ title, body, data }) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data
    },
    trigger: null
  });
}

export async function scheduleCountdownNotifications(task) {
  const saleDate = parseSaleTime(task.saleTime);
  if (!saleDate) {
    return [];
  }

  const offsets = [
    { minutes: 30, label: "30 分钟" },
    { minutes: 10, label: "10 分钟" },
    { minutes: 1, label: "1 分钟" }
  ];

  const ids = [];
  for (const offset of offsets) {
    const triggerDate = new Date(saleDate.getTime() - offset.minutes * 60 * 1000);
    if (triggerDate.getTime() <= Date.now()) {
      continue;
    }
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "开票倒计时提醒",
        body: `${task.showName || "演出"} 距离开票还有 ${offset.label}，请按平台规则手动操作。`,
        data: { taskId: task.id, url: task.url }
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: CHANNEL_ID
      }
    });
    ids.push(id);
  }
  return ids;
}
