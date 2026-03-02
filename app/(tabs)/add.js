import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from 'expo-router';
import { useState } from "react";
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Calendar } from 'react-native-calendars'; // 1. Added this import
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';

export default function AddMedicationScreen() {
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState("consecutive");
  const [days, setDays] = useState(12);
  const [selectedDates, setSelectedDates] = useState([]);
  const router = useRouter();
  
  // 2. Added markedDates to keep the circles visible
  const [markedDates, setMarkedDates] = useState({});
  
  const [takes, setTakes] = useState([{ time: "09:00", dose: 2 }]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentTakeIndex, setCurrentTakeIndex] = useState(null);
  const [tempDate, setTempDate] = useState(new Date());

  // 3. The logic to toggle circles on/off
  const handleDayPress = (day) => {
    const dateString = day.dateString;
    let newMarkedDates = { ...markedDates };

    if (newMarkedDates[dateString]) {
      // If already circled, remove the circle
      delete newMarkedDates[dateString];
      setSelectedDates(selectedDates.filter(d => d !== dateString));
    } else {
      // If not circled, add the circle
      newMarkedDates[dateString] = {
        selected: true,
        selectedColor: '#0a5f6a', // Matches your Done button color
      };
      setSelectedDates([...selectedDates, dateString].sort());
    }
    setMarkedDates(newMarkedDates);
  };

  const addTake = () => setTakes([...takes, { time: "12:00", dose: 1 }]);
  
  const removeTake = (index) => {
    if (takes.length > 1) setTakes(takes.filter((_, i) => i !== index));
  };

  const updateDose = (index, delta) => {
    const updated = [...takes];
    updated[index].dose = Math.max(1, updated[index].dose + delta);
    setTakes(updated);
  };

  const openTimePicker = (index) => {
    Keyboard.dismiss(); 
    const [hours, minutes] = takes[index].time.split(':');
    const date = new Date();
    date.setHours(parseInt(hours));
    date.setMinutes(parseInt(minutes));
    setTempDate(date);
    setCurrentTakeIndex(index);
    setShowTimePicker(true);
  };

  const onTimeChange = (event, selectedTime) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (event.type === 'set' && selectedTime && currentTakeIndex !== null) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      const updated = [...takes];
      updated[currentTakeIndex].time =`${hours}:${minutes}`;
      setTakes(updated);
    }
  };

  const handleAddMedication = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter medication name");
      return;
    }
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not logged in");

      const { data: medication, error: medError } = await supabase
        .from('add med table') 
        .insert({
          user_id: user.id,
          name: name.trim(),
          schedule_type: scheduleType,
          start_date: new Date().toISOString().split('T')[0],
          num_of_days: scheduleType === "consecutive" ? days : null
        })
        .select().single();

      if (medError) throw medError;

      const takesToInsert = takes.map(take => ({
        medication_id: medication.id,
        user_id: user.id,
        time: take.time,
        dose: take.dose
      }));

      await supabase.from('medication takes').insert(takesToInsert);
      if (scheduleType === "specific" && selectedDates.length > 0) {
        const datesToInsert = selectedDates.map(date => ({
          medication_id: medication.id,
          scheduled_date: date
        }));
        await supabase.from('medication_dates').insert(datesToInsert);
      }

      Alert.alert("Success", "Medication added successfully!");
      setName("");
      setSelectedDates([]);
      setMarkedDates({}); // Clear circles on reset
      setTakes([{ time: "09:00", dose: 2 }]);
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Ionicons name="arrow-back-outline" size={30} color="#fff" />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Medication name</Text>
          <TextInput placeholder="Enter name" placeholderTextColor="#8e8e8e" style={styles.input} value={name} onChangeText={setName} />
        </View>

        {takes.map((take, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Take {index + 1}</Text>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                {takes.length > 1 && (
                    <TouchableOpacity onPress={() => removeTake(index)}>
                        <Ionicons name="trash-outline" size={24} color="#d32f2f" />
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.plusCircle} onPress={addTake}>
                    <Ionicons name="add-circle-outline" size={29} color="#0b6f7c" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.row}>
              <View>
                <Text style={styles.smallLabel}>Time</Text>
                <TouchableOpacity style={styles.timeBox} onPress={() => openTimePicker(index)}>
                  <Ionicons name="time-outline" size={18} color="#4F4F4F" />
                  <Text style={styles.timeText}>{take.time}</Text>
                </TouchableOpacity>
              </View>

              <View>
                <Text style={styles.smallLabel}>Dose</Text>
                <View style={styles.counter}>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => updateDose(index, -1)}>
                    <Text style={styles.counterTextdose}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterValuedose}>{take.dose}</Text>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => updateDose(index, 1)}>
                    <Text style={styles.counterTextdose}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ))}

        <View style={styles.scheduleSelector}>
          <TouchableOpacity style={[styles.scheduleBtn, scheduleType === "consecutive" && styles.scheduleBtnActive]} onPress={() => setScheduleType("consecutive")}>
            <Text style={[styles.scheduleBtnText, scheduleType === "consecutive" && styles.scheduleBtnTextActive]}>Consecutive Days</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.scheduleBtn, scheduleType === "specific" && styles.scheduleBtnActive]} onPress={() => setScheduleType("specific")}>
            <Text style={[styles.scheduleBtnText, scheduleType === "specific" && styles.scheduleBtnTextActive]}>Pick Specific Days</Text>
          </TouchableOpacity>
        </View>
        {scheduleType === "consecutive" && (
          <View style={styles.cardnodays}>
            <Text style={styles.cardTitle}>Number of days</Text>
            <View style={styles.counterCenter}>
              <TouchableOpacity style={styles.counterBtn} onPress={() => setDays(Math.max(1, days - 1))}><Text style={styles.counterTextnodays}>−</Text></TouchableOpacity>
              <View style={styles.nodaysbox}><Text style={styles.counterValuenodays}>{days}</Text></View>
              <TouchableOpacity style={styles.counterBtn} onPress={() => setDays(days + 1)}><Text style={styles.counterTextnodays}>+</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {scheduleType === "specific" && (
          <View style={styles.cardstartday}>
            <Text style={styles.cardTitle}>Treatment days</Text>
            <TouchableOpacity style={styles.dateBox} onPress={() => setShowCalendar(true)}>
              <Ionicons name="calendar-outline" size={20} color="#0b6f7c" />
              <Text style={styles.dateText}>{selectedDates.length === 0 ? "Select days" : `${selectedDates.length} days selected`}</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={handleAddMedication}>
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* iOS Time Picker Modal */}
      {showTimePicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Time</Text>
              <DateTimePicker value={tempDate} mode="time" is24Hour={true} display="spinner" onChange={onTimeChange} textColor="black" themeVariant="light" />
              <TouchableOpacity style={styles.fullWidthDoneBtn} onPress={() => setShowTimePicker(false)}>
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* --- DESIGN FIXED: CALENDAR MODAL WITH MULTI-CIRCLE --- */}
      {showCalendar && (
        <Modal transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select treatment days</Text>
              
              <Calendar
                onDayPress={handleDayPress}
                markedDates={markedDates}
                theme={{
                  todayTextColor: '#0b6f7c',
                  arrowColor: '#0b6f7c',
                  selectedDayBackgroundColor: '#0a5f6a',
                  selectedDayTextColor: '#ffffff',
                  textDayFontWeight: '600',
                  textMonthFontWeight: 'bold',
                }}
              />
              <View style={styles.modalButtonsRow}>
                <TouchableOpacity style={styles.modalUnifiedBtn} onPress={() => setShowCalendar(false)}>
                  <Text style={styles.modalDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
      {/* Bottom Navigation */}
          <View style={styles.bottomNav}>
            <TouchableOpacity 
              style={styles.navButton}
              onPress={() => router.replace('home')}
            >
              <Icon name="home-outline" size={30} color="#9CA3AF" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.navButton}
              onPress={() => router.replace('add')}
            >
              <Icon name="add-circle-outline" size={30} color="#0b6f7c" />
            </TouchableOpacity>
            
            <TouchableOpacity
             style={styles.navButton}>
              onPress={() =>router.replace('notification')}
              <Icon name="notifications-outline" size={30} color="#9CA3AF" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.navButton}
              onPress={() => router.replace('history')}
            >
              <Icon name="time-outline" size={30} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: 
  { 
    flex: 1, 
    backgroundColor: "#0b4f5c" 
  },
  scrollContent: 
  { 
    paddingHorizontal: 16, 
    paddingTop: 50, paddingBottom: 30
   },
  header: 
  { 
    flexDirection: "row", 
    alignItems: "center",
     marginBottom: 20 },
  label: 
  {
     color: "#fff",
      fontSize: 18,
       marginBottom: 8,
       fontWeight: "700", 
       marginLeft: 10 
      },
  inputWrapper: 
  {
     marginBottom: 16
   },
  input: 
  {
     backgroundColor: "#e6e6e6", 
     borderRadius: 20, 
     paddingVertical: 12, 
     paddingHorizontal: 20,
     fontSize: 16,
     height: 50
     },
  card: 
  { 
    backgroundColor: "#e6e6e6",
    borderRadius: 39,
    padding: 16,
    marginBottom: 20,
    height: 160 
  },
  cardHeader: 
  { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center"
   },
  cardTitle: 
  { 
    fontSize: 20, 
    fontWeight: "700",
    color: "#0b6f7c", 
    paddingLeft: 4,
    paddingTop: 1
   },
  plusCircle:
   {
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: "#e6e6e6", 
    justifyContent: "center",
     alignItems: "center" 
    },
  row:
   { 
    flexDirection: "row", 
    justifyContent: "space-evenly",
     gap: 90, 
     marginTop: 12 
    },
  smallLabel:
   { fontSize: 17,
     color: "#555",
     fontWeight: "700", 
     marginBottom: 4
     },
  timeBox: 
  { 
    flexDirection: "row",
     alignItems: "center", 
     backgroundColor: "#C1C1C1",
      borderRadius: 16, 
      height: 40, 
      paddingHorizontal: 12,
       paddingLeft: 9,
        paddingVertical: 8 
      },
  timeText: 
  { 
    marginLeft: 5,
     fontWeight: "700", 
     fontSize: 17,
      color: "#4F4F4F"
     },
  counter:
   { 
    flexDirection: "row",
     alignItems: "center",
    backgroundColor: "#C1C1C1",
    borderRadius: 16,
    paddingHorizontal: 5,
    height: 40 
        },
  counterBtn: 
  { 
    paddingHorizontal: 10, 
    paddingVertical: 4
   },
  counterTextdose: 
  { 
    fontSize: 22,
     color: "#0b6f7c", 
     fontWeight: "600"
     },
  counterValuedose: 
  { 
    fontSize: 18,
    fontWeight: "700",
     marginHorizontal: 6,
      color: "#4F4F4F"
     },
  cardnodays: 
  {
     backgroundColor: "#e6e6e6",
      borderRadius: 37, 
      padding: 16,
       marginBottom: 20,
        height: 110 
      },
  counterCenter: 
  {
     flexDirection: "row",
      alignItems: "center", 
     justifyContent: "center", 
     marginTop: 10 
    },
  nodaysbox: 
  { 
    flexDirection: "row",
     alignItems: "center",
     backgroundColor: "#C1C1C1", 
     borderRadius: 15, 
     paddingHorizontal: 20,
      height: 40 
    },
  counterValuenodays: 
  { 
    fontSize: 20,
     fontWeight: "700",
      marginHorizontal: 6, 
      color: "#4F4F4F"
     },
  counterTextnodays:
   { 
    fontSize: 29,
     color: "#0b6f7c", 
     fontWeight: "600"
     },
  cardstartday: 
  { 
    backgroundColor: "#e6e6e6", 
    borderRadius: 37,
    padding: 16,
    marginBottom: 20,
     height: 130 
      },
  dateBox: 
  { 
    flexDirection: "row",
     alignItems: "center", 
     backgroundColor: "#C1C1C1",
     borderRadius: 20, 
     paddingLeft: 22, 
     marginTop: 10, 
     height: 54, 
     marginHorizontal: 70
     },
  dateText: 
  { 
    marginLeft: 8, 
    fontWeight: "600", 
    fontSize: 18, 
    color: "#4F4F4F" 
  },
  scheduleSelector: 
  { 
    flexDirection: "row", 
    gap: 10, 
    marginBottom: 20 
  },
  scheduleBtn: 
  { 
    flex: 1,
     backgroundColor: "#e6e6e6", 
     borderRadius: 20,
      padding: 15,
       alignItems: "center"
       },
  scheduleBtnActive: 
  { 
    backgroundColor: "#0b6f7c" 
  },
  scheduleBtnText:
   {
     fontWeight: "700",
      color: "#555" 
    },
  scheduleBtnTextActive:
   { 
    color: "#fff" 
  },
  addBtn: 
  { 
    backgroundColor: "#0a5f6a", 
    borderRadius: 30, 
    paddingVertical: 14, 
    alignItems: "center", 
    marginTop: 10
   },
  addText: 
  {
     color: "#fff",
      fontSize: 19, 
      fontWeight: "700" 
    },
  modalOverlay:
   { flex: 1,
     backgroundColor: 'rgba(0,0,0,0.5)', 
     justifyContent: 'flex-end'
     },
  modalContent: 
  { 
    backgroundColor: '#fff', 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20,
     padding: 20, 
     paddingBottom: 40 
    },
  modalTitle: 
  {
     fontSize: 20, 
    fontWeight: '700',
     color: '#0b6f7c', 
     textAlign: 'center',
      marginBottom: 15 
    },
  modalButtonsRow: 
  { 
    flexDirection: 'row', 
    gap: 10,
     marginTop: 15
     },
  modalUnifiedBtn: 
  {
     flex: 1, 
    backgroundColor: '#0a5f6a',
     padding: 15, 
     borderRadius: 10,
      alignItems: 'center' 
    },
  fullWidthDoneBtn: 
  {
     backgroundColor: '#0a5f6a',
     padding: 15,
      borderRadius: 10, 
      alignItems: 'center',
       marginTop: 15 
      },
  modalDoneText: 
  { 
    color: '#fff', fontSize: 16,
     fontWeight: '600' 
  },
    bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingBottom: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  navButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});