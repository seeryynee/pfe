import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

const { width } = Dimensions.get("window");
const ITEM_WIDTH = 72;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatTimeDisplay = (timeStr) => {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hours = parseInt(h, 10);
  const ampm = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 || 12;
  return `${display}:${m} ${ampm}`;
};

const isTimeInFuture = (timeStr, dateStr) => {
  const now = new Date();
  const [year, month, day] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  const medTime = new Date(year, month - 1, day, h, m, 0, 0);
  return medTime > now;
};

// ─────────────────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  // ── Role & identity ──
  const [role, setRole] = useState(null); // 'caregiver' | 'patient'
  const [myPatientId, setMyPatientId] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);

  // ── Caregiver: patient list ──
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // ── Date strip ──
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateRange, setDateRange] = useState([]);
  const scrollRef = useRef(null);

  // ── Schedule data ──
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { init(); }, []);

  // Build 46-day date strip (15 before today, today, 30 after)
  useEffect(() => {
    const dates = [];
    const today = new Date();
    for (let i = -15; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    setDateRange(dates);

    setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: 15 * ITEM_WIDTH - width / 2 + ITEM_WIDTH / 2,
        animated: false,
      });
    }, 150);
  }, []);

  // Fetch history whenever date or active patient changes
  useEffect(() => {
    if (!pageLoading) {
      const patId = role === "patient" ? myPatientId : selectedPatient?.id ?? null;
      fetchHistoryData(patId);
    }
  }, [selectedDate, selectedPatient, myPatientId, role, pageLoading]);

  // ────────────────────────────────────────────────────────────────────────
  // INIT
  // ────────────────────────────────────────────────────────────────────────
  const init = async () => {
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) return;

      // Is caregiver?
      const { data: cg } = await supabase
        .from("care_giver")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (cg) {
        setRole("caregiver");
        await loadPatients(user.id);
        return;
      }

      // Is patient?
      // ✅ FIXED: patients.id = auth user id directly (user_id column removed)
      const { data: pat, error: patErr } = await supabase
        .from("patients")
        .select("id, name")
        .eq("id", user.id)
        .maybeSingle();

      if (patErr) console.error("[init] patients error:", patErr.message);

      if (pat) {
        setRole("patient");
        setMyPatientId(pat.id);
      }
    } catch (err) {
      console.error("[init] unexpected error:", err);
    } finally {
      setPageLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // CAREGIVER — load patients list
  // ────────────────────────────────────────────────────────────────────────
  const loadPatients = async (userId) => {
    const { data, error } = await supabase
      .from("patients")
      .select("id, name, created_at") // user_id removed from schema
      .eq("caregiver_id", userId)
      .order("created_at", { ascending: true });

    if (error) { console.error("[loadPatients] error:", error.message); return; }

    const list = data ?? [];
    setPatients(list);
    if (list.length > 0) setSelectedPatient(list[0]);
  };

  // ────────────────────────────────────────────────────────────────────────
  // FETCH HISTORY for a given patient ID + selected date
  // ────────────────────────────────────────────────────────────────────────
  const fetchHistoryData = async (patId) => {
    if (!patId) { setMedications([]); return; }

    setLoading(true);
    try {
      const selectedStr = toLocalDateString(selectedDate);

      // 1 ── Prescriptions for this patient
      const { data: prescriptions, error: rxErr } = await supabase
        .from("prescription")
        .select("id, schedule_type, start_date, num_of_days, medication(id, name)")
        .eq("patient_id", patId);

      if (rxErr) {
        console.error("[fetchHistoryData] prescription error:", rxErr.message);
        setMedications([]);
        return;
      }
      if (!prescriptions?.length) { setMedications([]); return; }

      const prescriptionIds = prescriptions.map((p) => p.id);

      // 2 ── Intake time slots
      const { data: intakeTimes, error: itErr } = await supabase
        .from("intake_time")
        .select("id, prescription_id, time, dose")
        .in("prescription_id", prescriptionIds);

      if (itErr) console.error("[fetchHistoryData] intake_time error:", itErr.message);

      // 3 ── Specific dates for 'specific' prescriptions
      const { data: specDates, error: sdErr } = await supabase
        .from("specific_medication_dates")
        .select("id, prescription_id, scheduled_date")
        .in("prescription_id", prescriptionIds)
        .eq("scheduled_date", selectedStr);

      if (sdErr) console.error("[fetchHistoryData] specific_medication_dates error:", sdErr.message);

      // 4 ── History logs for this patient on the selected date
      const { data: logs, error: logErr } = await supabase
        .from("history")
        .select("prescription_id, intake_time_id, scheduled_time, status, taken_at")
        .eq("patient_id", patId)
        .or(
          `and(status.eq.taken,taken_at.gte.${selectedStr}T00:00:00+00:00,taken_at.lte.${selectedStr}T23:59:59+00:00),` +
          `and(status.eq.missed,scheduled_time.not.is.null)`
        );

      if (logErr) console.error("[fetchHistoryData] history error:", logErr.message);

      // 5 ── Build daily list
      const dailyList = [];

      for (const pm of prescriptions) {
        let activeToday = false;

        if (pm.schedule_type === "consecutive") {
          if (pm.start_date && pm.num_of_days) {
            const start    = new Date(`${pm.start_date}T00:00:00`);
            const curr     = new Date(`${selectedStr}T00:00:00`);
            const diffDays = Math.round((curr - start) / 86_400_000);
            activeToday    = diffDays >= 0 && diffDays < parseInt(pm.num_of_days, 10);
          }
        } else if (pm.schedule_type === "specific") {
          activeToday = specDates?.some((sd) => sd.prescription_id === pm.id) ?? false;
        }

        if (!activeToday) continue;

        const slots = intakeTimes?.filter((s) => s.prescription_id === pm.id) ?? [];

        for (const slot of slots) {
          const isTaken =
            logs?.some(
              (l) =>
                l.status === "taken" &&
                (l.intake_time_id === slot.id ||
                  (l.prescription_id === pm.id && l.scheduled_time === slot.time))
            ) ?? false;

          const upcoming = isTimeInFuture(slot.time, selectedStr);

          dailyList.push({
            name:     pm.medication?.name ?? "Unknown",
            time:     slot.time,
            dose:     slot.dose,
            taken:    isTaken,
            upcoming: !isTaken && upcoming,
          });
        }
      }

      // 6 ── Group by time slot, sort chronologically
      const grouped = dailyList.reduce((acc, item) => {
        const existing = acc.find((g) => g.time === item.time);
        if (existing) {
          existing.items.push(item);
        } else {
          acc.push({ time: item.time, items: [item] });
        }
        return acc;
      }, []);

      setMedications(grouped.sort((a, b) => a.time.localeCompare(b.time)));
    } catch (err) {
      console.error("[fetchHistoryData] unexpected error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (item) => {
    if (item.taken)    return { name: "checkmark-circle", color: "#2ecc71" };
    if (item.upcoming) return { name: "time",             color: "#f39c12" };
    return                    { name: "close-circle",     color: "#e74c3c" };
  };

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7DD1E0" />
        </View>
      </SafeAreaView>
    );
  }

  const noPatientSelected = role === "caregiver" && !selectedPatient;

  return (
    <SafeAreaView style={styles.container}>

      {/* Patient chips — caregiver only */}
      {role === "caregiver" && (
        <View style={styles.patientWrapper}>
          <Text style={styles.sectionTitle}>Patients</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {patients.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.patientChip, selectedPatient?.id === p.id && styles.patientChipSelected]}
                onPress={() => setSelectedPatient(p)}
              >
                <Text style={[styles.patientChipText, selectedPatient?.id === p.id && styles.patientChipTextSelected]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Date strip */}
      <View style={styles.dateBar}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          decelerationRate="fast"
        >
          {dateRange.map((date, i) => {
            const isSelected = date.toDateString() === selectedDate.toDateString();
            const isToday    = date.toDateString() === new Date().toDateString();
            const month   = date.toLocaleDateString("en-US", { month: "short" });
            const dayNum  = date.getDate();
            const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setSelectedDate(date)}
                style={[
                  styles.dateCard,
                  isToday    && styles.todayCard,
                  isSelected && styles.selectedCard,
                  isToday && isSelected && styles.todaySelectedCard,
                ]}
              >
                <Text style={[styles.monthText, isToday && styles.todayText, isSelected && styles.selectedText, isToday && isSelected && styles.todaySelectedText]}>
                  {month}
                </Text>
                <Text style={[styles.dateNum, isToday && styles.todayText, isSelected && styles.selectedText, isToday && isSelected && styles.todaySelectedText]}>
                  {dayNum}
                </Text>
                <Text style={[styles.dateDay, isToday && styles.todayText, isSelected && styles.selectedText, isToday && isSelected && styles.todaySelectedText]}>
                  {dayName}
                </Text>
                {isToday && (
                  <View style={[styles.todayDot, isSelected && styles.todayDotSelected]} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content area */}
      {noPatientSelected ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={60} color="rgba(255,255,255,0.4)" />
          <Text style={[styles.emptyText, { marginTop: 15 }]}>Please select a patient</Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7DD1E0" />
        </View>
      ) : medications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={60} color="rgba(255,255,255,0.4)" />
          <Text style={[styles.emptyText, { marginTop: 15 }]}>No medications scheduled for this day.</Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {medications.map((group, index) => (
            <View key={index} style={styles.timelineRow}>
              <View style={styles.leftLine}>
                <View style={styles.dot} />
                <View style={styles.line} />
              </View>
              <View style={styles.medCard}>
                <Text style={styles.timeLabel}>{formatTimeDisplay(group.time)}</Text>
                <View style={styles.medItemsContainer}>
                  {group.items.map((med, medIdx) => {
                    const icon = getStatusIcon(med);
                    return (
                      <View key={medIdx} style={styles.medRow}>
                        <Ionicons name={icon.name} size={20} color={icon.color} />
                        <Text style={styles.medNameText}>
                          {med.name}{" "}
                          <Text style={styles.doseText}>
                            ({med.dose} pill{med.dose !== 1 ? "s" : ""})
                          </Text>
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b4f5c" },

  patientWrapper:          { paddingHorizontal: 20, marginBottom: 16, marginTop: 10 },
  sectionTitle:            { color: "#fff", fontSize: 20, fontWeight: "bold", marginBottom: 12 },
  patientChip:             { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  patientChipSelected:     { backgroundColor: "#7DD1E0", borderColor: "#7DD1E0" },
  patientChipText:         { color: "#fff", fontWeight: "600", fontSize: 14 },
  patientChipTextSelected: { color: "#0b4f5c", fontWeight: "bold" },

  dateBar:          { paddingLeft: 20, marginBottom: 15, height: 100 },
  dateCard:         { backgroundColor: "#D9D9D9", width: 60, height: 90, borderRadius: 15, justifyContent: "center", alignItems: "center", marginRight: 12 },
  selectedCard:     { backgroundColor: "#4D595B", borderWidth: 1, borderColor: "#7DD1E0" },
  todayCard:        { backgroundColor: "#ffffff", borderWidth: 2, borderColor: "#7DD1E0" },
  todayText:        { color: "#0b4f5c" },
  todaySelectedCard:{ backgroundColor: "#7DD1E0", borderWidth: 2, borderColor: "#7DD1E0" },
  todaySelectedText:{ color: "#0b4f5c" },
  todayDot:         { width: 5, height: 5, borderRadius: 3, backgroundColor: "#7DD1E0", marginTop: 3 },
  todayDotSelected: { backgroundColor: "#0b4f5c" },
  monthText:        { fontSize: 10, fontWeight: "bold", color: "#06303A" },
  dateNum:          { fontSize: 18, fontWeight: "bold", color: "#06303A" },
  dateDay:          { fontSize: 11, color: "#06303A" },
  selectedText:     { color: "#7DD1E0" },

  content:             { flex: 1, paddingHorizontal: 20 },
  timelineRow:         { flexDirection: "row", minHeight: 100 },
  leftLine:            { alignItems: "center", marginRight: 15 },
  dot:                 { width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff", marginTop: 40 },
  line:                { width: 2, flex: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  medCard:             { flex: 1, backgroundColor: "#D9D9D9", borderRadius: 20, padding: 20, marginVertical: 10, flexDirection: "row", alignItems: "center" },
  timeLabel:           { fontSize: 16, fontWeight: "bold", color: "#06303A", width: 85 },
  medItemsContainer:   { flex: 1, borderLeftWidth: 1, borderLeftColor: "#BDC3C7", paddingLeft: 15 },
  medRow:              { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  medNameText:         { fontSize: 15, color: "#06303A", marginLeft: 8, fontWeight: "500" },
  doseText:            { fontSize: 13, color: "#555", fontWeight: "400" },

  center:    { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  emptyText: { color: "rgba(255,255,255,0.6)", fontSize: 16, fontWeight: "500", textAlign: "center" },
});