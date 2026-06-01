import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';

const getLocalDateString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};



 export default function NotificationScreen() {
  const [notification, setNotification] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  const router = useRouter();
  const [patients, setPatients] = useState([]); 
  const [selectedId, setSelectedId] = useState(null); 
  const [selectedName, setSelectedName] = useState(""); 

    const initData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;


      const { data: patientsData } = await supabase
        .from('patients')
        .select('*')
        .eq('caregiver_id', user.id)
        .order('created_at', { ascending: true });
      
      if (patientsData) {
        setPatients(patientsData);
      }
      

    } catch (error) {
      console.error("Init error:", error);
    }
  };

  // RAFRAÎCHISSEMENT AUTOMATIQUE QUAND ON ARRIVE SUR LA PAGE OU ON REVIENT OU SELECEDID CHANGE
  useFocusEffect(
    useCallback(() => {
      initData(); 
      const interval = setInterval(() => {
      if (selectedId) {
        checkMissedMedications();
      }
      }, 30000); 
      //pour ne pas refraicher manuellment pour voir les changment de notifications we use supabase realtime
      const notificationSubscription = supabase
        .channel('notification-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notification' }, () => {
          fetchNotification();
        })
        .subscribe();

      return () => {
        //s'execute quand j quitte notification screen ou selectedid change ou app fermer
        clearInterval(interval);
        notificationSubscription.unsubscribe();
      };
    }, [selectedId]) 
  );
 
  const checkMissedMedications = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !selectedId) return;

    const now = new Date();//objet Date complet
    const currentDate = getLocalDateString();//recuperer que la date en string 
    const currentTime = now.toTimeString().slice(0, 8);//recuperer l'heur avec timezone apres extraire que les 8 caracteres pour extraire que l'heur

    // Récupère tous les médicaments programmés aujourd'hui
    const { data: allTakes } = await supabase
      .from('intake_time')
      .select('*,prescription (id, schedule_type, start_date, num_of_days, medication(name))')
      .eq('prescription.patient_id', selectedId);
      if (!selectedId) 
      return;
   
    if (!allTakes || allTakes.length === 0) return;

    // Pour chaque médicament programmé
    for (const take of allTakes) {
      const scheduledTime = take.time; 
      const medName =
       take.prescription?.medication?.name || "Medication";
      const scheduleType = take.prescription?.schedule_type;
      const startDate = take.prescription?.start_date;
      const numOfDays = take.prescription?.num_of_days; 
      const prescriptionId = take.prescription?.id;
        
      let isProgrammedToday = false;
      if (scheduleType === 'consecutive') {
       
        const start = new Date(startDate);//transforme start Date en objet Date
        const end = new Date(start);
        end.setDate(end.getDate() + numOfDays - 1);//retourner le jour de mois + num of dzys moins 1
        const today = new Date(currentDate);
      // Vérifie si aujourd'hui est entre start_date et start_date + num_of_days
        isProgrammedToday = today >= start && today <= end;
        
      } else if (scheduleType === 'specific') {
        // Pour les dates spécifiques
        const { data: scheduledToday } = await supabase
          .from('specific_medication_dates')
          .select('*')
          .eq('prescription_id', prescriptionId)
          .eq('scheduled_date', currentDate);

        isProgrammedToday = scheduledToday && scheduledToday.length > 0;
      }

      
      if (!isProgrammedToday) {
        continue;
      }

      

      const [schedHour, schedMin] = scheduledTime.split(':').map(Number);
      const [nowHour, nowMin] = currentTime.split(':').map(Number);
      
      const scheduledMinutes = schedHour * 60 + schedMin;
      const nowMinutes = nowHour * 60 + nowMin;
      
      const differenceMinutes = nowMinutes - scheduledMinutes;
      
      
      if (differenceMinutes > 15) {

        const { data: logs } = await supabase
          .from('history')
          .select('*')
          .eq('patient_id', selectedId)
          .eq('prescription_id', prescriptionId)
          .eq('intake_time_id', take.id)
          .eq('status','taken')
          .gte('taken_at', `${currentDate}T00:00:00`)
          .lte('taken_at', `${currentDate}T23:59:59`);

      
        if (!logs || logs.length === 0) {
          const { data: existingNotif } = await supabase
            .from('notification')
            .select('*')
            .eq('caregiver_id', user.id)
            .eq('prescription_id', prescriptionId)
            .eq('scheduled_time', scheduledTime)
            .gte('created_at',` ${currentDate}T00:00:00`);
            if (existingNotif && existingNotif.length > 0) {
           console.log("Notif exist");
           continue;
        }
         
          if (!existingNotif || existingNotif.length === 0) {
             const { data: patientData } = await supabase
              .from('patients')
              .select('name')
              .eq('id', selectedId)
              .single();
            const patientName = patientData ?.name || "Patient";
            
            const { data:insertNotif,error: insertError } =
            await supabase.from('notification').insert({
              caregiver_id: user.id,
              prescription_id: prescriptionId,
              patient_id: selectedId,
              scheduled_time: scheduledTime,
              type: 'missed',
              message: `"${patientName}" missed "${medName}" scheduled at ${scheduledTime.slice(0, 5)}`,
              show_call_button: true,
              is_read: false,
              created_at: now.toISOString(),
            })
            .select();
             if (insertError) {
               console.error("Insert error", insertError);
               continue;
              
             } else {
                console.log("notification created");
                
             }

                  
              await supabase.from('history').insert({
                patient_id: selectedId,
                prescription_id: prescriptionId,
                intake_time_id: take.id,
                scheduled_time: scheduledTime,
                status: 'missed',
                taken_at: null,
              });

              console.log(" History entry created");
               
            try {          
              await Notifications.scheduleNotificationAsync({
               content: {
               title:`⚠️ ${patientName} - Medication Missed!`,
               body: `${medName} scheduled at ${scheduledTime.slice(0, 5)} was not taken`,
               data: { patientId: selectedId,  patientName: patientName,medicationName: medName,type: 'medication-missed',}, 
               sound: 'default',
      
               },
               
               trigger: {
               channelId:'medication-reminders-v3', 
},
             });
                console.log("notification sent");
            } catch (notifError) {
                console.error ("push notification error:", notifError);
                
            }
             
         } 
       }
      }
     }
    } catch (error) {
    console.error(" checkMissedMedications error:", error);
  }
};


  useEffect(() => {
     const init = async () => {
    
   
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('patients')
        .select('*')
        .eq('caregiver_id', user.id);
      
      if (data && data.length > 0) {
        setPatients(data);
      }
    }

  };
  init();
}, []);
   useEffect(() => {
    if (selectedId) {
      console.log("Patient sélectionné :", selectedName);
      fetchNotification();     
      checkMissedMedications();
      
    }
  }, [selectedId]); 
 const fetchNotification = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !selectedId) {
      setNotification([]);
      return;
    }

  
    const { data, error } = await supabase
      .from('notification')
      .select('*') 
      .eq('caregiver_id', user.id)
      .eq('patient_id', selectedId) 
      .order('created_at', { ascending: false });

    if (error) throw error;

    setNotification(data || []);
  } catch (error) {
    console.error('Erreur fetch:', error);
  }
};

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotification();
    setRefreshing(false);
  };

  const markAsRead = async (id) => {
    try {
      const { error } = await supabase
        .from('notification')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;
      await fetchNotification();
    } catch (error) {
      console.error('Erreur:', error);
    }
  };
  
  const deleteNotification = async (id) => {
    Alert.alert(
      '🗑️ Delete Notification',
      'Are you sure you want to delete this notification ?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('notification')
                .delete()
                .eq('id', id);

              if (error) throw error;
              await fetchNotification();
            } catch (error) {
              console.error('Erreur:', error);
            }
          },
        },
      ]
    );
  };

  const makeCall = async (patientId) => {
  try {
   
    const { data: patient, error } = await supabase
      .from('patients')
      .select('phone_number')
      .eq('id', patientId)
      .single();

    if (error) throw error;

    if (!patient?.phone_number) {
      Alert.alert('Error', '📞 Phone number not found');
      return;
    }

    const url = `tel:${patient.phone_number}`;
    //verifier si l'appareil peut ouvrir ce lien
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      //ouvre auto l'app avec le num
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'Unable to open the phone dialer');
    }
  } catch (err) {
    console.error('Call error:', err);
    Alert.alert('Error', 'Failed to make call');
  }
};
//pour time created at tae notification 
  const formatTime = (timestamp) => {
    //transfomer une date recuperer depuis DB qui en timestamp en objet date lisible
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
    return `${hours}:${minutes} ${ampm}`;
    };
//cette fonction recoit param timestamp (date et heur) le transforme en date et le compare avec today date  pour verifier si notification a ete creer today ou non 
 //pour separes les notif en 2 onglets 
const isToday = (timestamp) => {
    const today = new Date();
    //convertire le timrstamp tae notification on objet date 
    const date = new Date(timestamp);
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const todayNotification = notification.filter((notif) => isToday(notif.created_at));
  const oldNotification = notification.filter((notif) => !isToday(notif.created_at));

  const displayedNotification = activeTab === 'today' ? todayNotification : oldNotification;
  const renderNotification = ({ item }) => (
    <TouchableOpacity
      style={[styles.notificationCard, !item.is_read && styles.unreadCard]}
      onPress={() => !item.is_read && markAsRead(item.id)}
      onLongPress={() => deleteNotification(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        {/* Icône */}
        <View style={styles.iconContainer}>
          <Icon name="medical-outline" size={24} color="#FFFFFF" />
        </View>

        {/* Contenu */}
        <View style={styles.textContainer}>
          <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          <Text style={styles.messageText}>{item.message}</Text>
        </View>

        
        
        {item.show_call_button && (
          <TouchableOpacity
            style={styles.callButton}
            onPress={() => makeCall(item.patient_id)}
          >
            <Icon name="call" size={16} color="#FFFFFF" style={{ marginRight: 6}} />
            <Text style={styles.callButtonText}>call</Text>
          </TouchableOpacity>
        )}

        {/* Indicateur non lu */}
        {!item.is_read && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B5563" />
  
      {/* Header */}
      <View style={styles.header}>
        
        <View style={styles.placeholder} />
      </View>
      {/* Section Patients */}
   <View style={styles.sectionContainer}>
   <Text style={styles.sectionTitle}>Select Patient</Text>
   <ScrollView 
    horizontal 
    showsHorizontalScrollIndicator={false} 
    style={styles.titleSpacing}
   >
    {patients.map(p => (
      <TouchableOpacity 
        key={p.id} 
        style={[
          styles.patientChip, 
          selectedId === p.id && styles.patientChipSelected
        ]} 
        onPress={() => {
          setSelectedId(p.id);
          setSelectedName(p.name);
        }}
      >
        <Text style={[
          styles.patientChipText, 
          selectedId === p.id && styles.patientChipTextSelected
        ]}>
          {p.name}
        </Text>
      </TouchableOpacity>
      ))}
    </ScrollView>
   </View>
      {!selectedId ? (
      // SI AUCUN PATIENT N'EST SÉLECTIONNÉ
      <View style={styles.emptyyContainer}>
        <Icon name="person-outline" size={80} color="rgba(255, 255, 255, 0.3)" />
        <Text style={styles.emptyyText}>Please select a patient to view notifications</Text>
      </View>
    ) : (
      // SI UN PATIENT EST SÉLECTIONNÉ (On affiche tout le reste)
      <>
        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'today' && styles.activeTab]}
            onPress={() => setActiveTab('today')}
          >
            <Text style={[styles.tabText, activeTab === 'today' && styles.activeTabText]}>Today</Text>
            {todayNotification.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{todayNotification.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'old' && styles.activeTab]}
            onPress={() => setActiveTab('old')}
          >
            <Text style={[styles.tabText, activeTab === 'old' && styles.activeTabText]}>Old</Text>
            {oldNotification.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{oldNotification.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Liste des notifications */}
        <FlatList
          data={displayedNotification}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FFFFFF"
              colors={['#14B8A6']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="notifications-off-outline" size={80} color="rgba(255, 255, 255, 0.3)" />
              <Text style={styles.emptyText}>
                {activeTab === 'today' ? 'No notification today' : 'No old notification'}
              </Text>
            </View>
          }
        />
      </>
    )}
    
  </View>
);

      
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b4f5c',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#0b4f5c',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  placeholder: {
    width: 40,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#0b4f5c',
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeTab: {
    backgroundColor: '#06333f',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  notificationCard: {
    backgroundColor: '#E8F4F3',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  unreadCard: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 4,
    borderLeftColor: '#0b4f5c',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#06333f',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  timeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0B5563',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  sectionContainer: { 
    paddingHorizontal: 20, 
    marginBottom: 15,
  },
  sectionTitle: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  titleSpacing: { 
    marginTop: 10 
  },
  patientChip: { 
    backgroundColor: 'rgba(255,255,255,0.2)', 
    borderRadius: 20, 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    marginRight: 10,
  },
  patientChipSelected: { 
    backgroundColor: '#7DD1E0' 
  },
  patientChipText: { 
    color: '#fff', 
    fontWeight: '600'
  },
  patientChipTextSelected: { 
    color: '#0b4f5c' 
  },
  callButton: {
    backgroundColor: '#06333f',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 25,
    marginLeft: 8,
    minWidth: 80,
    flexDirection:'row',
    alignItems: 'center'
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  unreadDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 16,
    textAlign: 'center',
  },
   emptyyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginBottom: 100, // Pour compenser l'espace du header
  },
   emptyyText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 20,
    opacity: 0.8,
    fontWeight: '500',
    lineHeight: 26,
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

