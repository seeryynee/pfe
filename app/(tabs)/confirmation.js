import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';


// ── Local date helpers ────────────────────────────────────────────────────────
const getLocalDateString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Local ISO string without UTC shift (for taken_at inserts)
const getLocalISOString = () => {
  const now    = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now - offset).toISOString();
};

export default function ConfirmationScreen() {
  const router = useRouter();
  const [loading, setLoading]           = useState(false);
  const [patientId, setPatientId]       = useState(null);
  const [patientName, setPatientName]   = useState('');
  const [currentMeds, setCurrentMeds]   = useState([]);
  const [selectedMeds, setSelectedMeds] = useState([]);
  const [isMultiMode, setIsMultiMode]   = useState(false);
  const [pageLoading, setPageLoading]   = useState(true);

  useEffect(() => { getPatientInfo(); }, []);

  useEffect(() => {
    if (patientId) fetchMedsForToday();
  }, [patientId]);

  useFocusEffect(
    useCallback(() => {
      if (patientId) fetchMedsForToday();
    }, [patientId])
  );

  // ────────────────────────────────────────────────────────────────────────
  // Get the logged-in patient's row
  // ────────────────────────────────────────────────────────────────────────
  const getPatientInfo = async () => {
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) { router.replace('/(auth)/login'); return; }

      // ✅ patients.id = auth.uid() — no user_id column
      const { data: patient, error } = await supabase
        .from('patients')
        .select('id, name')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (patient) {
        setPatientId(patient.id);
        setPatientName(patient.name);
      } else {
        Alert.alert(
          'Setup Required',
          'Your patient account is not configured. Please contact your caregiver.',
        );
      }
    } catch (err) {
      console.error('[getPatientInfo] error:', err.message);
    } finally {
      setPageLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Fetch medications scheduled for TODAY that are within ±60 min of now
  // and haven't been taken yet.
  //
  // FIX: now checks whether each prescription is actually active today
  // (consecutive date range OR specific scheduled date) before including
  // its intake slots — preventing expired/unscheduled meds from showing up.
  // ────────────────────────────────────────────────────────────────────────
  const fetchMedsForToday = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const todayStr = getLocalDateString();
      const now      = new Date();
      const nowMin   = now.getHours() * 60 + now.getMinutes();

      // ── Already-taken intake_time ids today ──
      const { data: takenMeds } = await supabase
        .from('history')
        .select('intake_time_id')
        .eq('patient_id', patientId)
        .eq('status', 'taken')
        .gte('taken_at', `${todayStr}T00:00:00`)
        .lte('taken_at', `${todayStr}T23:59:59`);

      const takenIds = takenMeds?.map(t => t.intake_time_id) ?? [];

      // ── All prescriptions for this patient ──
      const { data: prescriptions, error: rxErr } = await supabase
        .from('prescription')
        .select('id, schedule_type, start_date, num_of_days, medication(name)')
        .eq('patient_id', patientId);

      if (rxErr) throw rxErr;
      if (!prescriptions?.length) { setCurrentMeds([]); return; }

      // ── Filter to prescriptions active today ──
      const activePrescriptionIds = [];

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
          const { data: spec } = await supabase
            .from('specific_medication_dates')
            .select('id')
            .eq('prescription_id', pm.id)
            .eq('scheduled_date', todayStr);

          activeToday = (spec?.length ?? 0) > 0;
        }

        if (activeToday) activePrescriptionIds.push(pm.id);
      }

      if (activePrescriptionIds.length === 0) { setCurrentMeds([]); return; }

      // ── Fetch intake slots only for active prescriptions ──
      const { data: allTakes, error: takesErr } = await supabase
        .from('intake_time')
        .select(`
          *,
          prescription!inner(
            id,
            patient_id,
            medication_id,
            medication(name)
          )
        `)
        .in('prescription_id', activePrescriptionIds);

      if (takesErr) throw takesErr;

      // ── Keep only slots within ±60 min of now that aren't taken ──
      const medsFound = (allTakes ?? []).filter(take => {
        const [h, m]   = take.time.split(':').map(Number);
        const takeMin  = h * 60 + m;
        const inWindow = Math.abs(nowMin - takeMin) <= 60;
        const notTaken = !takenIds.includes(take.id);
        const isPast   = takeMin < nowMin;
        return (inWindow || isPast) && notTaken;
      });

      setCurrentMeds(medsFound);
      setIsMultiMode(medsFound.length > 1);
      setSelectedMeds([]);
    } catch (err) {
      console.error('[fetchMedsForToday] error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Confirm medication taken
  // ────────────────────────────────────────────────────────────────────────
  const handleConfirm = async (singleMed = null) => {
    const medsToProcess = singleMed
      ? [singleMed]
      : currentMeds.filter(m => selectedMeds.includes(m.id));

    if (medsToProcess.length === 0) {
      Alert.alert('Selection', 'Please select at least one medication.');
      return;
    }

    setLoading(true);
    try {
      const { data: patientData } = await supabase
        .from('patients')
        .select('caregiver_id')
        .eq('id', patientId)
        .single();

      if (!patientData) throw new Error('Patient not found');

      const localISO = getLocalISOString();

      for (const med of medsToProcess) {
        const allScheduled = await Notifications
        .getAllScheduledNotificationsAsync();

      // LIGNE 2 : Pour chaque notification programmée
      for (const scheduled of allScheduled) {

        // LIGNE 3 : Récupère les données de cette notif
        const notifData = scheduled.content.data;

        // LIGNE 4 : Vérifie si c'est pour CE médicament
        if (notifData?.intake_time_id === med.id) {

          // LIGNE 5 : Annule cette notification
          await Notifications
            .cancelScheduledNotificationAsync(
              scheduled.identifier
            );

          console.log("✅ Notification annulée:", 
            scheduled.identifier);
        }
      }
        // Insert history entry
        const { error: histErr } = await supabase.from('history').insert({
          patient_id:      patientId,
          prescription_id: med.prescription?.id,
          intake_time_id:  med.id,
          status:          'taken',
          taken_at:        localISO,
          scheduled_time:  med.time,
        });
        if (histErr) { console.error('[handleConfirm] history error:', histErr.message); throw histErr; }

        // Notify caregiver
        const { error: notifErr } = await supabase.from('notification').insert({
          caregiver_id:    patientData.caregiver_id,
          patient_id:      patientId,
          prescription_id: med.prescription?.id,
          scheduled_time:  med.time,
          type:            'taken',
          message:         `${patientName} took ${med.prescription?.medication?.name ?? 'medication'} scheduled at ${med.time.slice(0, 5)}`,
          is_read:         false,
          created_at:      localISO,
        });
        if (notifErr) console.error('[handleConfirm] notification error:', notifErr.message);
      }

      Alert.alert('✅ Done!', 'Medication confirmed successfully!');
      fetchMedsForToday();
    } catch (err) {
      console.error('[handleConfirm] error:', err.message);
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0b4f5c" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello 👋</Text>
          <Text style={styles.patientNameText}>{patientName || 'Patient'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>

        {/* Loading */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#0b4f5c" />
            <Text style={styles.loadingTextDark}>Loading medications...</Text>
          </View>

        /* No meds right now */
        ) : currentMeds.length === 0 ? (
          <View style={styles.centerBox}>
            <View style={styles.iconCircleSuccess}>
              <Ionicons name="checkmark-done-circle" size={120} color="#4CAF50" />
            </View>
            <Text style={styles.mainTitle}>All good!</Text>
            <Text style={styles.subTitle}>No medication scheduled{'\n'}for this time 🎉</Text>
          </View>

        /* Single medication */
        ) : !isMultiMode ? (
          <View style={styles.centerBox}>
            <View style={styles.iconCircleMed}>
              <Ionicons name="medical" size={90} color="#0b4f5c" />
            </View>
            <Text style={styles.mainTitle}>Time for your medication!</Text>

            <View style={styles.medCard}>
              <View style={styles.medIconContainer}>
                <Ionicons name="medical-outline" size={32} color="#0b4f5c" />
              </View>
              <View style={styles.medInfo}>
                <Text style={styles.medName}>
                  {currentMeds[0]?.prescription?.medication?.name}
                </Text>
                <View style={styles.timeRow}>
                  <Ionicons name="time-outline" size={18} color="#df0505" />
                  <Text style={styles.medTime}>{currentMeds[0]?.time?.slice(0, 5)}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.question}>Did you take it?</Text>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => handleConfirm(currentMeds[0])}
              disabled={loading}
            >
              <Ionicons name="checkmark-circle" size={30} color="#fff" />
              <Text style={styles.confirmText}>YES</Text>
            </TouchableOpacity>
          </View>

        /* Multiple medications */
        ) : (
          <View style={styles.multiContainer}>
            <View style={styles.iconCircleMed}>
              <Ionicons name="medical" size={60} color="#0b4f5c" />
            </View>
            <Text style={styles.mainTitle}>Select medications taken:</Text>

            {currentMeds.map((med) => (
              <TouchableOpacity
                key={med.id}
                style={[
                  styles.medCardMulti,
                  selectedMeds.includes(med.id) && styles.medCardMultiSelected,
                ]}
                onPress={() =>
                  setSelectedMeds(prev =>
                    prev.includes(med.id)
                      ? prev.filter(id => id !== med.id)
                      : [...prev, med.id]
                  )
                }
              >
                <View style={styles.checkboxContainer}>
                  <Ionicons
                    name={selectedMeds.includes(med.id) ? 'checkbox' : 'square-outline'}
                    size={32}
                    color={selectedMeds.includes(med.id) ? '#4CAF50' : '#666'}
                  />
                </View>
                <View style={styles.medCardContent}>
                  <Text style={styles.medCardName}>
                    {med.prescription?.medication?.name}
                  </Text>
                  <View style={styles.timeRow}>
                    <Ionicons name="time-outline" size={18} color="#df0505" />
                    <Text style={styles.medCardTime}>{med.time?.slice(0, 5)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[
                styles.confirmButton,
                selectedMeds.length === 0 && styles.confirmButtonDisabled,
              ]}
              onPress={() => handleConfirm()}
              disabled={loading || selectedMeds.length === 0}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={30} color="#fff" />
                  <Text style={styles.confirmText}>CONFIRM ({selectedMeds.length})</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0b4f5c' },
  loadingContainer: { flex: 1, backgroundColor: '#f5f7fa', justifyContent: 'center', alignItems: 'center' },
  loadingText:      { color: '#0b4f5c', marginTop: 15, fontSize: 16, fontWeight: '500' },
  loadingTextDark:  { color: '#666', marginTop: 15, fontSize: 16 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingTop: 55,
    paddingBottom: 25,
    backgroundColor: '#0b4f5c',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  greeting:        { color: '#fffdfd', fontSize: 18, fontWeight: '500' },
  patientNameText: {
    color: '#ffffff', fontSize: 32, fontWeight: 'bold', marginTop: 4,
    textShadowColor: 'rgba(2,2,2,0.15)',
    textShadowOffset: { width: 2, height: 4 },
    textShadowRadius: 2,
  },

  mainContent:  { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 25 },
  centerBox:    { alignItems: 'center', width: '100%' },

  iconCircleSuccess: { backgroundColor: '#E3F2FD', borderRadius: 100, padding: 35, marginBottom: 80 },
  iconCircleMed:     { backgroundColor: '#E3F2FD', borderRadius: 100, padding: 35, marginBottom: 30 },

  mainTitle: { fontSize: 32, color: '#ffffff', fontWeight: 'bold', textAlign: 'center', lineHeight: 34, marginBottom: 30 },
  subTitle:  { fontSize: 18, color: '#ffffff', textAlign: 'center', lineHeight: 24 },
  question:  { color: '#ffffff', fontSize: 24, marginBottom: 25, fontWeight: '500' },

  medCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    width: '100%', padding: 20, borderRadius: 20, marginBottom: 25,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  medIconContainer: { backgroundColor: '#E3F2FD', padding: 14, borderRadius: 50, marginRight: 16 },
  medInfo:          { flex: 1 },
  medName:          { fontSize: 30, fontWeight: 'bold', color: '#2D3748', marginBottom: 6 },
  timeRow:          { flexDirection: 'row', alignItems: 'center', gap: 6 },
  medTime:          { fontSize: 18, color: '#999', fontWeight: '500' },

  confirmButton: {
    backgroundColor: '#4CAF50', paddingVertical: 20, paddingHorizontal: 20,
    borderRadius: 50, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 10, width: '100%',
    shadowColor: '#000000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  confirmButtonDisabled: { backgroundColor: '#CBD5E0', shadowOpacity: 0, elevation: 0 },
  confirmText:           { color: '#fff', fontSize: 28, fontWeight: 'bold', letterSpacing: 0.5 },

  multiContainer: { width: '100%', alignItems: 'center' },
  medCardMulti: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    width: '100%', padding: 18, borderRadius: 16, marginBottom: 12,
    borderWidth: 2, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  medCardMultiSelected: { borderColor: '#4CAF50', backgroundColor: '#F0FFF4' },
  checkboxContainer:    { marginRight: 14 },
  medCardContent:       { flex: 1 },
  medCardName:          { fontSize: 18, fontWeight: '700', color: '#2D3748', marginBottom: 6 },
  medCardTime:          { fontSize: 15, color: '#666', fontWeight: '500' },
});