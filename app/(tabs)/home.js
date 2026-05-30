import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getLocalDateString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getStatusIcon = (taken, pending) => {
  if (taken)   return { name: 'checkmark-circle', color: '#27ae60' };
  if (pending) return { name: 'time',             color: '#f39c12' };
  return               { name: 'alert-circle',    color: '#e74c3c' };
};

// ─────────────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const [role, setRole]           = useState(null); // 'caregiver' | 'patient'
  const [userName, setUserName]   = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const router = useRouter();

  // ── Caregiver state ──
  const [patients, setPatients]             = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const selectedPatientRef                  = useRef(null);
  const [todaySchedule, setTodaySchedule]   = useState([]);
  const [medicationStock, setMedicationStock] = useState([]);
  const [dismissedStockIds, setDismissedStockIds] = useState([]);

  // ── Patient state ──
  const [patientSchedule, setPatientSchedule] = useState([]);
  const [patientStock, setPatientStock]         = useState([]);
  const [patientDismissedIds, setPatientDismissedIds] = useState([]);
  const [patientId, setPatientId]               = useState(null);

  // ── Edit patient modal ──
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [editingPatient, setEditingPatient]     = useState(null);
  const [editName, setEditName]     = useState('');
  const [editAge, setEditAge]       = useState('');
  const [editDisease, setEditDisease] = useState('');
  const [editPhone, setEditPhone]   = useState('');

  // ── Edit medication modal ──
  const [showMedModal, setShowMedModal]         = useState(false);
  const [editingMed, setEditingMed]             = useState(null);
  const [editMedName, setEditMedName]           = useState('');
  const [editMedTime, setEditMedTime]           = useState('09:00');
  const [editMedDose, setEditMedDose]           = useState('1');
  const [showInlineTimePicker, setShowInlineTimePicker] = useState(false);
  const [tempTimeDate, setTempTimeDate]         = useState(new Date());

  // ── Init ──
  useEffect(() => { init(); }, []);

  // Keep ref in sync
  useEffect(() => { selectedPatientRef.current = selectedPatient; }, [selectedPatient]);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      if (role === 'caregiver' && selectedPatient) {
        fetchTodaySchedule(selectedPatient.id);
        fetchMedicationStock(selectedPatient.id);
      } else if (role === 'patient' && patientId) {
        fetchPatientSchedule(patientId);
        fetchPatientStock(patientId);
      }
    }, [role, selectedPatient?.id, patientId])
  );

  // Refresh caregiver data when selected patient changes
  useEffect(() => {
    if (selectedPatient) {
      fetchTodaySchedule(selectedPatient.id);
      fetchMedicationStock(selectedPatient.id);
    }
  }, [selectedPatient?.id]);

  // ────────────────────────────────────────────────────────────────────────
  // INIT — determine role then load the right data
  // ────────────────────────────────────────────────────────────────────────
  const init = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) { console.error('[init] auth error:', authError.message); return; }
      if (!user) return;

      setUserName(user.user_metadata?.full_name ?? user.email.split('@')[0]);

      // Restore dismissed IDs from local storage
      const [savedCg, savedPat] = await Promise.all([
        AsyncStorage.getItem('dismissedStockIds'),
        AsyncStorage.getItem('patientDismissedStockIds'),
      ]);
      if (savedCg)  setDismissedStockIds(JSON.parse(savedCg));
      if (savedPat) setPatientDismissedIds(JSON.parse(savedPat));

      // ── Is this user a caregiver? ──
      const { data: caregiver, error: cgError } = await supabase
        .from('care_giver')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (cgError) console.error('[init] care_giver query error:', cgError.message);

      if (caregiver) {
        setRole('caregiver');
        await loadCaregiverData(user.id);
        return;
      }

      // ── Is this user a patient? ──
      // ✅ FIXED: patients.id is now the auth user id directly (user_id column removed)
      const { data: patient, error: patError } = await supabase
        .from('patients')
        .select('id, name')
        .eq('id', user.id)
        .maybeSingle();

      if (patError) console.error('[init] patients query error:', patError.message);

      if (patient) {
        setRole('patient');
        setPatientId(patient.id);
        setUserName(patient.name);
        // Pass ID directly — don't wait for setPatientId to settle
        await fetchPatientSchedule(patient.id);
        await fetchPatientStock(patient.id);
      }
    } catch (err) {
      console.error('[init] unexpected error:', err);
    } finally {
      setPageLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // CAREGIVER — load patients list
  // ────────────────────────────────────────────────────────────────────────
  const loadCaregiverData = async (userId) => {
    try {
      const { data: pts, error } = await supabase
        .from('patients')
        .select('id, name, age, disease, phone_number, created_at') // user_id removed
        .eq('caregiver_id', userId)
        .order('created_at', { ascending: true });

      if (error) { console.error('[loadCaregiverData] error:', error.message); return; }

      const list = pts ?? [];
      setPatients(list);

      if (list.length > 0) {
        const prev       = selectedPatientRef.current;
        const stillExists = prev ? list.find((p) => p.id === prev.id) : null;
        setSelectedPatient(stillExists ?? list[0]);
      } else {
        setSelectedPatient(null);
        setTodaySchedule([]);
        setMedicationStock([]);
      }
    } catch (err) {
      console.error('[loadCaregiverData] unexpected error:', err);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // SHARED — build schedule list for a given patient
  // ────────────────────────────────────────────────────────────────────────
  const buildScheduleForPatient = async (patId) => {
    const todayStr = getLocalDateString();
    const now      = new Date();

    const { data: prescriptions, error: rxError } = await supabase
      .from('prescription')
      .select('*, medication(id, name)')
      .eq('patient_id', patId);

    if (rxError) { console.error('[buildScheduleForPatient] prescriptions error:', rxError.message); return []; }
    if (!prescriptions?.length) return [];

    const { data: todayLogs, error: histError } = await supabase
      .from('history')
      .select('prescription_id, scheduled_time, status')
      .eq('patient_id', patId)
      .eq('status', 'taken')
      .not('taken_at', 'is', null)
      .gte('taken_at', `${todayStr}T00:00:00+00:00`)
      .lte('taken_at', `${todayStr}T23:59:59+00:00`);

    if (histError) console.error('[buildScheduleForPatient] history error:', histError.message);

    const schedule = [];

    for (const pm of prescriptions) {
      let activeToday = false;

      if (pm.schedule_type === 'consecutive') {
        if (pm.start_date && pm.num_of_days) {
          const start    = new Date(`${pm.start_date}T00:00:00`);
          const today    = new Date(`${todayStr}T00:00:00`);
          const diffDays = Math.round((today - start) / 86_400_000);
          activeToday    = diffDays >= 0 && diffDays < parseInt(pm.num_of_days, 10);
        }
      } else if (pm.schedule_type === 'specific') {
        const { data: spec, error: specError } = await supabase
          .from('specific_medication_dates')
          .select('id')
          .eq('prescription_id', pm.id)
          .eq('scheduled_date', todayStr);

        if (specError) console.error('[buildScheduleForPatient] specific dates error:', specError.message);
        activeToday = (spec?.length ?? 0) > 0;
      }

      if (!activeToday) continue;

      const { data: slots, error: slotsError } = await supabase
        .from('intake_time')
        .select('*')
        .eq('prescription_id', pm.id);

      if (slotsError) console.error('[buildScheduleForPatient] intake_time error:', slotsError.message);

      for (const slot of slots ?? []) {
        const [h, min] = slot.time.split(':').map(Number);
        const slotDate  = new Date();
        slotDate.setHours(h, min, 0, 0);

        const taken =
          todayLogs?.some(
            (l) =>
              l.prescription_id === pm.id &&
              l.scheduled_time  === slot.time &&
              l.status          === 'taken'
          ) ?? false;

        schedule.push({
          scheduleId:   slot.id,
          pmId:         pm.id,
          medicationId: pm.medication?.id,
          name:         pm.medication?.name ?? 'Unknown',
          time:         slot.time,
          dose:         slot.dose,
          taken,
          pending: !taken && slotDate > now,
        });
      }
    }

    return schedule.sort((a, b) => a.time.localeCompare(b.time));
  };

  // ────────────────────────────────────────────────────────────────────────
  // SHARED — build stock list for a given patient
  // ────────────────────────────────────────────────────────────────────────
  const buildStockForPatient = async (patId) => {
    const todayStr = getLocalDateString();

    const { data: pmeds, error } = await supabase
      .from('prescription')
      .select('*, medication(name)')
      .eq('patient_id', patId);

    if (error) { console.error('[buildStockForPatient] error:', error.message); return []; }

    const stockList = [];

    for (const pm of pmeds ?? []) {
      let remaining = 0;

      if (pm.schedule_type === 'consecutive') {
        if (pm.start_date && pm.num_of_days) {
          const start   = new Date(`${pm.start_date}T00:00:00`);
          const today   = new Date(`${todayStr}T00:00:00`);
          const elapsed = Math.round((today - start) / 86_400_000);
          remaining     = Math.max(0, parseInt(pm.num_of_days, 10) - elapsed);
        }
      } else if (pm.schedule_type === 'specific') {
        const { count, error: cntError } = await supabase
          .from('specific_medication_dates')
          .select('*', { count: 'exact', head: true })
          .eq('prescription_id', pm.id)
          .gte('scheduled_date', todayStr);

        if (cntError) console.error('[buildStockForPatient] count error:', cntError.message);
        remaining = count ?? 0;
      }

      stockList.push({
        id:            pm.id,
        name:          pm.medication?.name ?? 'Unknown',
        daysRemaining: remaining,
      });
    }

    return stockList.sort((a, b) => a.daysRemaining - b.daysRemaining);
  };

  // ── Caregiver wrappers ──
  const fetchTodaySchedule  = async (patId) => setTodaySchedule(await buildScheduleForPatient(patId));
  const fetchMedicationStock = async (patId) => setMedicationStock(await buildStockForPatient(patId));

  // ── Patient wrappers ──
  const fetchPatientSchedule = async (pid) => setPatientSchedule(await buildScheduleForPatient(pid));
  const fetchPatientStock    = async (pid) => setPatientStock(await buildStockForPatient(pid));

  // ────────────────────────────────────────────────────────────────────────
  // DELETE PATIENT (caregiver only)
  // ────────────────────────────────────────────────────────────────────────
  const deletePatient = (patient) => {
    Alert.alert(
      'Delete Patient',
      `Are you sure you want to permanently delete "${patient.name}"?\n\nThis will remove ALL of their data. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('patients').delete().eq('id', patient.id);
            if (error) { Alert.alert('Error', error.message); return; }
            selectedPatientRef.current = null;
            setSelectedPatient(null);
            setTodaySchedule([]);
            setMedicationStock([]);
            const { data: { user } } = await supabase.auth.getUser();
            await loadCaregiverData(user.id);
          },
        },
      ]
    );
  };

  // ────────────────────────────────────────────────────────────────────────
  // EDIT / DELETE MEDICATION (caregiver only)
  // ────────────────────────────────────────────────────────────────────────
  const openEditMedModal = (item) => {
    setEditingMed(item);
    setEditMedName(item.name);
    setEditMedTime(item.time ?? '09:00');
    setEditMedDose(item.dose != null ? String(item.dose) : '1');
    setShowInlineTimePicker(false);
    if (item.time) {
      const [h, m] = item.time.split(':');
      const d = new Date();
      d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
      setTempTimeDate(d);
    }
    setShowMedModal(true);
  };

  const onInlineTimeChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowInlineTimePicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selectedDate) {
      setTempTimeDate(selectedDate);
      const hh = selectedDate.getHours().toString().padStart(2, '0');
      const mm = selectedDate.getMinutes().toString().padStart(2, '0');
      setEditMedTime(`${hh}:${mm}`);
    }
  };

  const saveMedication = async () => {
    if (!editingMed) return;

    const { error: schedErr } = await supabase
      .from('intake_time')
      .update({ time: editMedTime, dose: parseFloat(editMedDose) || 1 })
      .eq('id', editingMed.scheduleId);

    if (schedErr) { Alert.alert('Error updating time/dose', schedErr.message); return; }

    if (editingMed.medicationId) {
      const { error: medErr } = await supabase
        .from('medication')
        .update({ name: editMedName.trim() })
        .eq('id', editingMed.medicationId);
      if (medErr) { Alert.alert('Error updating medication name', medErr.message); return; }
    }

    setShowMedModal(false);
    const pid = selectedPatientRef.current?.id;
    if (pid) {
      await fetchTodaySchedule(pid);
      await fetchMedicationStock(pid);
    }
  };

  const deleteMedication = (item) => {
    Alert.alert(
      'Delete Medication',
      `Remove "${item.name}" completely for this patient?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (item.pmId) {
              await supabase.from('specific_medication_dates').delete().eq('prescription_id', item.pmId);
              await supabase.from('intake_time').delete().eq('prescription_id', item.pmId);
              await supabase.from('history').delete().eq('prescription_id', item.pmId);
              await supabase.from('prescription').delete().eq('id', item.pmId);
            }
            const pid = selectedPatientRef.current?.id;
            if (pid) {
              await fetchTodaySchedule(pid);
              await fetchMedicationStock(pid);
            }
          },
        },
      ]
    );
  };

  // ── Dismiss helpers ──
  const dismissStockItem = async (id) => {
    const updated = [...dismissedStockIds, id];
    setDismissedStockIds(updated);
    await AsyncStorage.setItem('dismissedStockIds', JSON.stringify(updated));
  };

  const dismissPatientStockItem = async (id) => {
    const updated = [...patientDismissedIds, id];
    setPatientDismissedIds(updated);
    await AsyncStorage.setItem('patientDismissedStockIds', JSON.stringify(updated));
  };

  // ────────────────────────────────────────────────────────────────────────
  // EDIT PATIENT (caregiver only)
  // ────────────────────────────────────────────────────────────────────────
  const openEditPatient = (patient) => {
    setEditingPatient(patient);
    setEditName(patient.name ?? '');
    setEditAge(patient.age != null ? String(patient.age) : '');
    setEditDisease(patient.disease ?? '');
    setEditPhone(patient.phone_number ?? '');
    setShowPatientModal(true);
  };

  const savePatient = async () => {
    if (!editName.trim()) { Alert.alert('Missing Info', 'Please enter the patient name.'); return; }
    const payload = {
      name:         editName.trim(),
      age:          editAge ? parseInt(editAge, 10) : null,
      disease:      editDisease.trim(),
      phone_number: editPhone.trim(),
    };
    const { error } = await supabase.from('patients').update(payload).eq('id', editingPatient.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowPatientModal(false);
    const { data: { user } } = await supabase.auth.getUser();
    await loadCaregiverData(user.id);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await init();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const visibleCaregiverStock = medicationStock.filter((item) => !dismissedStockIds.includes(item.id));
  const visiblePatientStock   = patientStock.filter((item) => !patientDismissedIds.includes(item.id));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
      >
        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.helloText}>Hello 👋</Text>
            <Text style={styles.userTitle}>{userName}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.logoutIconBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color="#0b4f5c" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════
            CAREGIVER VIEW
        ══════════════════════════════════════════════════ */}
        {role === 'caregiver' && (
          <>
            {/* Patient chips */}
            <View style={styles.sectionContainer}>
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

            {/* Patient info card */}
            {selectedPatient && (
              <View style={styles.sectionContainer}>
                <TouchableOpacity
                  style={styles.patientCard}
                  onPress={() => openEditPatient(selectedPatient)}
                  activeOpacity={0.85}
                >
                  <InfoRow label="Name"    value={selectedPatient.name} />
                  <InfoRow label="Age"     value={selectedPatient.age ? `${selectedPatient.age} years old` : 'N/A'} />
                  <InfoRow label="Disease" value={selectedPatient.disease || 'N/A'} />
                  <InfoRow label="Phone"   value={selectedPatient.phone_number || 'N/A'} />
                  <View style={styles.patientCardBottom}>
                    <Text style={styles.tapToEditText}>Tap to edit</Text>
                    <TouchableOpacity
                      onPress={() => deletePatient(selectedPatient)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Schedule */}
            {selectedPatient && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Schedule</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.titleSpacing}>
                  {todaySchedule.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyCardText}>No meds today</Text>
                    </View>
                  ) : (
                    todaySchedule.map((item, i) => {
                      const icon = getStatusIcon(item.taken, item.pending);
                      return (
                        <View key={item.scheduleId ?? i} style={styles.scheduleCard}>
                          <View style={styles.cardIcons}>
                            <TouchableOpacity onPress={() => openEditMedModal(item)} style={styles.cardIconBtn}>
                              <Ionicons name="pencil" size={13} color="#0b4f5c" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteMedication(item)} style={styles.cardIconBtn}>
                              <Ionicons name="trash-outline" size={13} color="#e74c3c" />
                            </TouchableOpacity>
                          </View>
                          <Ionicons name={icon.name} size={32} color={icon.color} />
                          <Text style={styles.cardMedName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.cardTime}>{item.time ? item.time.substring(0, 5) : '--:--'}</Text>
                          <Text style={styles.cardDose}>{item.dose} pill{item.dose !== 1 ? 's' : ''}</Text>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}

            {/* Treatment Tracker */}
            {selectedPatient && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Treatment Tracker</Text>
                <View style={[styles.stockMainCard, styles.titleSpacing]}>
                  {visibleCaregiverStock.length === 0 ? (
                    <View style={styles.noMedsContainer}>
                      <Text style={styles.noMedsText}>No medications tracked</Text>
                    </View>
                  ) : (
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.stockScroll}>
                      {visibleCaregiverStock.map((item) => (
                        <View key={item.id} style={styles.stockRow}>
                          <Text style={styles.stockNameLabel}>{item.name} :</Text>
                          <View style={styles.stockRight}>
                            <Text style={[styles.stockDaysValue, { color: item.daysRemaining === 0 ? '#e74c3c' : '#0b4f5c' }]}>
                              {item.daysRemaining} days remaining
                            </Text>
                            {item.daysRemaining === 0 && (
                              <TouchableOpacity onPress={() => dismissStockItem(item.id)} style={styles.dismissBtn}>
                                <Ionicons name="close-circle" size={18} color="#e74c3c" />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>
            )}

            <View style={{ height: 30 }} />
          </>
        )}

        {/* ══════════════════════════════════════════════════
            PATIENT VIEW — read-only
        ══════════════════════════════════════════════════ */}
        {role === 'patient' && (
          <>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Today's Schedule</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.titleSpacing}>
                {patientSchedule.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyCardText}>No meds today</Text>
                  </View>
                ) : (
                  patientSchedule.map((item, i) => {
                    const icon = getStatusIcon(item.taken, item.pending);
                    return (
                      <View key={i} style={styles.patientScheduleCard}>
                        <Ionicons name={icon.name} size={32} color={icon.color} />
                        <Text style={styles.cardMedName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.cardTime}>{item.time ? item.time.substring(0, 5) : '--:--'}</Text>
                        <Text style={styles.cardDose}>{item.dose} pill{item.dose !== 1 ? 's' : ''}</Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>

            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Treatment Tracker</Text>
              <View style={[styles.stockMainCard, styles.titleSpacing]}>
                {visiblePatientStock.length === 0 ? (
                  <View style={styles.noMedsContainer}>
                    <Text style={styles.noMedsText}>No medications tracked</Text>
                  </View>
                ) : (
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.stockScroll}>
                    {visiblePatientStock.map((item) => (
                      <View key={item.id} style={styles.stockRow}>
                        <Text style={styles.stockNameLabel}>{item.name} :</Text>
                        <View style={styles.stockRight}>
                          <Text style={[styles.stockDaysValue, { color: item.daysRemaining === 0 ? '#e74c3c' : '#0b4f5c' }]}>
                            {item.daysRemaining} days remaining
                          </Text>
                          {item.daysRemaining === 0 && (
                            <TouchableOpacity onPress={() => dismissPatientStockItem(item.id)} style={styles.dismissBtn}>
                              <Ionicons name="close-circle" size={18} color="#e74c3c" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>

            <View style={{ height: 30 }} />
          </>
        )}
      </ScrollView>

      {/* ── MODAL: EDIT PATIENT ── */}
      <Modal visible={showPatientModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Patient</Text>
            <TextInput style={styles.modalInput} placeholder="Name"    placeholderTextColor="#9e9e9e" value={editName}    onChangeText={setEditName} />
            <TextInput style={styles.modalInput} placeholder="Age"     placeholderTextColor="#9e9e9e" value={editAge}     onChangeText={setEditAge}  keyboardType="numeric" />
            <TextInput style={styles.modalInput} placeholder="Disease" placeholderTextColor="#9e9e9e" value={editDisease} onChangeText={setEditDisease} />
            <TextInput style={styles.modalInput} placeholder="Phone"   placeholderTextColor="#9e9e9e" value={editPhone}   onChangeText={setEditPhone} keyboardType="phone-pad" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowPatientModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={savePatient}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: EDIT MEDICATION ── */}
      <Modal visible={showMedModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Medication</Text>

            <Text style={styles.fieldLabel}>Medication Name</Text>
            <TextInput style={styles.modalInput} value={editMedName} onChangeText={setEditMedName} placeholder="e.g. Paracetamol" placeholderTextColor="#bbb" />

            <Text style={styles.fieldLabel}>Pills per take</Text>
            <TextInput style={styles.modalInput} keyboardType="decimal-pad" value={editMedDose} onChangeText={setEditMedDose} placeholder="e.g. 1" placeholderTextColor="#bbb" />

            <Text style={styles.fieldLabel}>Time</Text>
            <TouchableOpacity
              style={[styles.pickerField, showInlineTimePicker && styles.pickerFieldActive]}
              onPress={() => setShowInlineTimePicker((v) => !v)}
            >
              <Text style={styles.pickerText}>{editMedTime}</Text>
              <Ionicons name="time-outline" size={20} color="#0b4f5c" />
            </TouchableOpacity>

            {showInlineTimePicker && (
              <View style={styles.inlinePickerContainer}>
                <DateTimePicker
                  value={tempTimeDate}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  is24Hour
                  onChange={onInlineTimeChange}
                  textColor="#0b4f5c"
                  style={Platform.OS === 'ios' ? { width: '100%' } : {}}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity style={styles.confirmPickerBtn} onPress={() => setShowInlineTimePicker(false)}>
                    <Text style={styles.confirmPickerText}>Confirm Time ✓</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowMedModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveMedication}>
                <Text style={styles.modalSaveText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Small component ──────────────────────────────────────────────────────────
const InfoRow = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}:</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0b4f5c' },
  loadingContainer: { flex: 1, backgroundColor: '#0b4f5c', justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  helloText:     { color: 'rgba(255,255,255,0.7)', fontSize: 18 },
  userTitle:     { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  logoutIconBtn: { backgroundColor: '#fff', borderRadius: 50, padding: 8, elevation: 3 },

  sectionContainer: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle:     { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  titleSpacing:     { marginTop: 4 },

  patientChip:             { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10 },
  patientChipSelected:     { backgroundColor: '#7DD1E0' },
  patientChipText:         { color: '#fff', fontWeight: '600' },
  patientChipTextSelected: { color: '#0b4f5c' },

  patientCard:       { backgroundColor: '#f0f4f5', borderRadius: 25, padding: 16, elevation: 2 },
  infoRow:           { flexDirection: 'row', marginBottom: 8 },
  infoLabel:         { color: '#0b4f5c', fontWeight: 'bold', width: 80, fontSize: 14 },
  infoValue:         { color: '#333', fontSize: 14, flex: 1 },
  patientCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  tapToEditText:     { color: '#a0b5ba', fontSize: 13, fontStyle: 'italic' },

  scheduleCard: {
    backgroundColor: '#fff',
    borderRadius: 25,
    padding: 14,
    marginRight: 12,
    alignItems: 'center',
    minWidth: 110,
    elevation: 2,
  },
  cardIcons:   { flexDirection: 'row', gap: 6, marginBottom: 8, alignSelf: 'flex-end' },
  cardIconBtn: { backgroundColor: '#f0f4f5', borderRadius: 6, padding: 5 },

  patientScheduleCard: {
    backgroundColor: '#fff',
    borderRadius: 25,
    padding: 14,
    paddingTop: 18,
    marginRight: 12,
    alignItems: 'center',
    minWidth: 110,
    elevation: 2,
  },

  cardMedName: { color: '#0b4f5c', fontWeight: 'bold', fontSize: 13, marginTop: 6, textAlign: 'center' },
  cardTime:    { color: '#555', fontSize: 12, marginTop: 2 },
  cardDose:    { color: '#888', fontSize: 11, marginTop: 2 },

  emptyCard:     { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, justifyContent: 'center', alignItems: 'center', minWidth: 160 },
  emptyCardText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },

  stockMainCard:    { backgroundColor: '#f0f4f5', borderRadius: 32, padding: 18, elevation: 3, minHeight: 80, maxHeight: 230 },
  stockScroll:      { flexGrow: 0 },
  noMedsContainer:  { justifyContent: 'center', alignItems: 'center', paddingVertical: 6 },
  noMedsText:       { color: '#7b8b90', fontSize: 15, fontWeight: '600' },
  stockRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  stockNameLabel:   { color: '#0b4f5c', fontWeight: '600', fontSize: 15, flex: 1 },
  stockRight:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockDaysValue:   { fontSize: 14, fontWeight: '500' },
  dismissBtn:       { padding: 2 },

  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox:        { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' },
  modalTitle:      { fontSize: 20, fontWeight: 'bold', color: '#0b4f5c', marginBottom: 16 },
  modalInput:      { backgroundColor: '#f0f4f5', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 15 },
  modalButtons:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancel:     { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#0b4f5c', alignItems: 'center' },
  modalCancelText: { color: '#0b4f5c', fontWeight: '600' },
  modalSave:       { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#0b4f5c', alignItems: 'center' },
  modalSaveText:   { color: '#fff', fontWeight: '600' },

  fieldLabel:             { color: '#0b4f5c', fontWeight: '600', fontSize: 13, marginBottom: 4 },
  pickerField:            { backgroundColor: '#f0f4f5', borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerFieldActive:      { borderWidth: 1.5, borderColor: '#0b4f5c' },
  pickerText:             { color: '#0b4f5c', fontSize: 15, fontWeight: '500' },
  inlinePickerContainer:  { backgroundColor: '#f0f4f5', borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  confirmPickerBtn:       { backgroundColor: '#0b4f5c', padding: 10, alignItems: 'center' },
  confirmPickerText:      { color: '#fff', fontWeight: '600', fontSize: 14 },
});