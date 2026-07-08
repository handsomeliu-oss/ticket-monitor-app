import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { DEFAULT_INTERVAL_SECONDS, DEFAULT_PLATFORM_ID, MIN_INTERVAL_SECONDS, PLATFORM_OPTIONS } from "../constants";
import { clampInterval, getPlatformConfig, getPlatformDefaultKeywords, parseSaleTime } from "../utils/task";

const initialForm = {
  platformId: DEFAULT_PLATFORM_ID,
  showName: "",
  city: "",
  venue: "",
  url: "",
  appUrl: "",
  sessionName: "",
  ticketTier: "",
  saleTime: "",
  keywords: getPlatformDefaultKeywords(DEFAULT_PLATFORM_ID).join("、"),
  intervalSeconds: String(DEFAULT_INTERVAL_SECONDS)
};

export default function TaskForm({ onSubmit, initialValues, title = "新增演出任务" }) {
  const [form, setForm] = useState(initialForm);
  const [manualFields, setManualFields] = useState({});
  const initialValuesKey = [
    initialValues?.id || initialValues?.url || "",
    initialValues?.options?.cities?.join("|") || "",
    initialValues?.options?.venues?.join("|") || "",
    initialValues?.options?.sessions?.join("|") || "",
    initialValues?.options?.ticketTiers?.join("|") || ""
  ].join("::");

  useEffect(() => {
    if (!initialValues) {
      return;
    }
    const isTicketCandidate = initialValues.isTicketPlatform !== false;
    const platformId = isTicketCandidate ? initialValues.platformId || DEFAULT_PLATFORM_ID : DEFAULT_PLATFORM_ID;
    const options = normalizeOptions(initialValues.options, initialValues);
    setManualFields({});
    setForm({
      ...initialForm,
      platformId,
      showName: initialValues.showName || "",
      city: pickInitialValue(initialValues.city, options.cities),
      venue: pickInitialValue(initialValues.venue, options.venues),
      url: isTicketCandidate ? initialValues.url || "" : "",
      appUrl: initialValues.appUrl || "",
      sessionName: pickInitialValue(initialValues.sessionName, options.sessions),
      ticketTier: pickInitialValue(initialValues.ticketTier, options.ticketTiers),
      saleTime: initialValues.saleTime || "",
      keywords: initialValues.keywords || getPlatformDefaultKeywords(platformId).join("、"),
      intervalSeconds: String(initialValues.intervalSeconds || DEFAULT_INTERVAL_SECONDS)
    });
  }, [initialValuesKey]);

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectPlatform(platformId) {
    setForm((current) => ({
      ...current,
      platformId,
      keywords: getPlatformDefaultKeywords(platformId).join("、")
    }));
  }

  function submit() {
    const platform = getPlatformConfig(form.platformId);
    const ticketPlatformId = inferTicketPlatformIdFromUrl(form.url);
    if (initialValues?.isTicketPlatform === false && !ticketPlatformId) {
      Alert.alert(
        "缺少票务链接",
        "已识别演出信息，但未找到可监测的票务链接，请继续搜索票务平台或手动补充链接。"
      );
      return;
    }

    const required = [
      ["showName", "演出名称"],
      ["url", `${platform.name}网页链接`],
      ["sessionName", "场次"],
      ["ticketTier", "票档"],
      ["saleTime", "开票时间"]
    ];

    for (const [key, label] of required) {
      if (!form[key].trim()) {
        Alert.alert("信息不完整", `请填写${label}。`);
        return;
      }
    }

    const urlError = validateHttpUrl(form.url, `${platform.name}网页链接`);
    if (urlError) {
      Alert.alert("链接无效", urlError);
      return;
    }

    const appUrlError = validateOptionalUrl(form.appUrl);
    if (appUrlError) {
      Alert.alert("App 链接无效", appUrlError);
      return;
    }

    if (!parseSaleTime(form.saleTime)) {
      Alert.alert("开票时间格式错误", "请使用类似 2026-07-04 20:00 的格式。");
      return;
    }

    onSubmit({
      ...form,
      platformId: ticketPlatformId || form.platformId,
      intervalSeconds: clampInterval(form.intervalSeconds)
    });
    setForm({ ...initialForm, keywords: getPlatformDefaultKeywords(DEFAULT_PLATFORM_ID).join("、") });
  }

  const selectedPlatform = getPlatformConfig(form.platformId);
  const isCandidateMode = Boolean(initialValues);
  const options = normalizeOptions(initialValues?.options, initialValues);
  const isReferenceCandidate = initialValues?.isTicketPlatform === false;
  const sourceText = useMemo(() => {
    if (!initialValues) {
      return "";
    }
    if (initialValues.isTicketPlatform === false) {
      return "已识别演出信息，但未找到可监测的票务链接，请继续搜索票务平台或手动补充链接。";
    }
    return `来自：${initialValues.source || "公开网页"}，请确认城市、场馆、场次和票档后开始监测。`;
  }, [initialValues, initialValues?.source]);

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {sourceText ? <Text style={styles.sourceText}>{sourceText}</Text> : null}
      {isReferenceCandidate && initialValues?.url ? (
        <View style={styles.referenceBox}>
          <Text style={styles.referenceLabel}>信息来源</Text>
          <Text style={styles.referenceUrl} numberOfLines={2}>
            {initialValues.url}
          </Text>
        </View>
      ) : null}

      <Text style={styles.label}>平台</Text>
      <View style={styles.platformGrid}>
        {PLATFORM_OPTIONS.map((platform) => {
          const selected = form.platformId === platform.id;
          return (
            <TouchableOpacity
              key={platform.id}
              activeOpacity={0.82}
              style={[styles.platformButton, selected && styles.platformButtonSelected]}
              onPress={() => selectPlatform(platform.id)}
            >
              <Text style={[styles.platformButtonText, selected && styles.platformButtonTextSelected]}>
                {platform.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Field label="演出名称" value={form.showName} onChangeText={(value) => setValue("showName", value)} />
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <SelectableField
            label="城市"
            value={form.city}
            options={options.cities}
            fallbackLabel="城市"
            manualOpen={Boolean(manualFields.city)}
            candidateMode={isCandidateMode}
            onOpenManual={() => setManualFields((current) => ({ ...current, city: true }))}
            onSelect={(value) => setValue("city", value)}
            onChangeText={(value) => setValue("city", value)}
          />
        </View>
        <View style={styles.rowItem}>
          <SelectableField
            label="场馆"
            value={form.venue}
            options={options.venues}
            fallbackLabel="场馆"
            manualOpen={Boolean(manualFields.venue)}
            candidateMode={isCandidateMode}
            onOpenManual={() => setManualFields((current) => ({ ...current, venue: true }))}
            onSelect={(value) => setValue("venue", value)}
            onChangeText={(value) => setValue("venue", value)}
          />
        </View>
      </View>
      <Field
        label={`${selectedPlatform.name}网页链接`}
        value={form.url}
        onChangeText={(value) => setValue("url", value)}
        keyboardType="url"
        autoCapitalize="none"
        placeholder={selectedPlatform.urlPlaceholder}
      />
      <Field
        label="App 跳转链接（可选）"
        value={form.appUrl}
        onChangeText={(value) => setValue("appUrl", value)}
        keyboardType="url"
        autoCapitalize="none"
        placeholder="可填写官方 App deep link，留空则打开网页链接"
      />
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <SelectableField
            label="场次"
            value={form.sessionName}
            options={options.sessions}
            fallbackLabel="场次"
            manualOpen={Boolean(manualFields.sessionName)}
            candidateMode={isCandidateMode}
            onOpenManual={() => setManualFields((current) => ({ ...current, sessionName: true }))}
            onSelect={(value) => setValue("sessionName", value)}
            onChangeText={(value) => setValue("sessionName", value)}
          />
        </View>
        <View style={styles.rowItem}>
          <SelectableField
            label="票档"
            value={form.ticketTier}
            options={options.ticketTiers}
            fallbackLabel="票档"
            manualOpen={Boolean(manualFields.ticketTier)}
            candidateMode={isCandidateMode}
            onOpenManual={() => setManualFields((current) => ({ ...current, ticketTier: true }))}
            onSelect={(value) => setValue("ticketTier", value)}
            onChangeText={(value) => setValue("ticketTier", value)}
          />
        </View>
      </View>
      <Field
        label="开票时间"
        value={form.saleTime}
        onChangeText={(value) => setValue("saleTime", value)}
        placeholder="2026-07-04 20:00"
      />
      <Field
        label="提醒关键词"
        value={form.keywords}
        onChangeText={(value) => setValue("keywords", value)}
        placeholder="立即购买、有票、可购买"
        multiline
      />
      <Field
        label={`检测间隔，最少 ${MIN_INTERVAL_SECONDS} 秒`}
        value={form.intervalSeconds}
        onChangeText={(value) => setValue("intervalSeconds", value)}
        keyboardType="number-pad"
      />

      <TouchableOpacity activeOpacity={0.86} style={styles.primaryButton} onPress={submit}>
        <Text style={styles.primaryButtonText}>{isReferenceCandidate ? "补充票务链接后开始监测" : "开始监测"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function normalizeOptions(options, values = {}) {
  return {
    cities: normalizeOptionList([values?.city, ...(options?.cities || [])]),
    venues: normalizeOptionList([values?.venue, ...(options?.venues || [])]),
    sessions: normalizeOptionList([values?.sessionName, ...(options?.sessions || [])]),
    ticketTiers: normalizeOptionList([values?.ticketTier, ...(options?.ticketTiers || [])])
  };
}

function normalizeOptionList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function pickInitialValue(value, options) {
  const source = String(value || "").trim();
  if (!options.length) {
    return source;
  }
  if (options.includes(source)) {
    return source;
  }
  return options[0] || source;
}

function validateHttpUrl(value, label) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return `${label}必须是 http/https 网页链接。`;
    }
    return "";
  } catch {
    return `请输入有效的${label}。`;
  }
}

function validateOptionalUrl(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  try {
    const parsed = new URL(source);
    if (!parsed.protocol) {
      return "请输入有效的 App 跳转链接，或留空使用网页链接。";
    }
    return "";
  } catch {
    return "请输入有效的 App 跳转链接，或留空使用网页链接。";
  }
}

function inferTicketPlatformIdFromUrl(value) {
  const source = String(value || "").toLowerCase();
  if (!source) {
    return "";
  }
  if (isMaoyanTicketUrl(source)) {
    return "maoyan";
  }
  if (isAllowedTicketHost(source, ["damai.cn"])) {
    return "damai";
  }
  if (isAllowedTicketHost(source, ["bilibili.com", "mall.bilibili.com"])) {
    return "bilibili";
  }
  return "";
}

function isMaoyanTicketUrl(source) {
  return isAllowedTicketHost(source, ["show.maoyan.com", "maoyan.com", "meituan.com"]);
}

function isAllowedTicketHost(value, allowedHosts) {
  try {
    const parsed = new URL(String(value || "").trim());
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, autoCapitalize }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9AA5A2"
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

function SelectableField({
  label,
  value,
  options,
  fallbackLabel,
  manualOpen,
  candidateMode,
  onOpenManual,
  onSelect,
  onChangeText
}) {
  if (!options.length) {
    if (!candidateMode || manualOpen) {
      return <Field label={fallbackLabel} value={value} onChangeText={onChangeText} placeholder="请输入" />;
    }

    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity activeOpacity={0.82} style={styles.manualButton} onPress={onOpenManual}>
          <Text style={styles.manualButtonText}>未识别，点此补充</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceWrap}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <TouchableOpacity
              key={option}
              activeOpacity={0.82}
              style={[styles.choiceButton, selected && styles.choiceButtonSelected]}
              onPress={() => onSelect(option)}
            >
              <Text style={[styles.choiceButtonText, selected && styles.choiceButtonTextSelected]} numberOfLines={2}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DCE3E1",
    padding: 14
  },
  panelTitle: {
    color: "#162421",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12
  },
  sourceText: {
    color: "#60706C",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12
  },
  referenceBox: {
    borderWidth: 1,
    borderColor: "#D7DEDC",
    borderRadius: 8,
    backgroundColor: "#FBFCFC",
    padding: 10,
    marginBottom: 12
  },
  referenceLabel: {
    color: "#7D8986",
    fontSize: 11,
    marginBottom: 4
  },
  referenceUrl: {
    color: "#53605D",
    fontSize: 12,
    lineHeight: 17
  },
  platformGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12
  },
  platformButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D3D0",
    backgroundColor: "#FBFCFC",
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  platformButtonSelected: {
    borderColor: "#176B5D",
    backgroundColor: "#E2F2EC"
  },
  platformButtonText: {
    color: "#3D4A47",
    fontSize: 13,
    fontWeight: "800"
  },
  platformButtonTextSelected: {
    color: "#176B5D"
  },
  field: {
    marginBottom: 12
  },
  label: {
    color: "#3D4A47",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#C9D3D0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#1C2926",
    backgroundColor: "#FBFCFC",
    fontSize: 15
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: "top"
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  rowItem: {
    flex: 1
  },
  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  choiceButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D3D0",
    backgroundColor: "#FBFCFC",
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  choiceButtonSelected: {
    borderColor: "#176B5D",
    backgroundColor: "#E2F2EC"
  },
  choiceButtonText: {
    color: "#3D4A47",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  choiceButtonTextSelected: {
    color: "#176B5D"
  },
  manualButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D3D0",
    backgroundColor: "#FBFCFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  manualButtonText: {
    color: "#176B5D",
    fontSize: 13,
    fontWeight: "800"
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#176B5D",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16
  }
});
