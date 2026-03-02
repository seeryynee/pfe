// app/HomeScreen.js
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function HomeScreen() {
  // Données du patient
  const patientInfo = {
    name: 'Sam Franco',
    age: '80 ans',
    disease: 'Diabète',
    status: 'Tous médicaments pris',
  };

  // Planning des médicaments
  const schedule = [
    { id: 1, time: '8:00 AM', medication: 'Paracetamol', dosage: '10ml', taken: true },
    { id: 2, time: '8:40 AM', medication: 'Paracetamol', dosage: '10ml', taken: false },
  ];

  // Stock des médicaments
  const medicationStock = [
    { id: 1, name: 'Medecine1', daysRemaining: 7, status: 'warning' },
    { id: 2, name: 'Medecine2', daysRemaining: 30, status: 'good' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Bonjour, {patientInfo.name} 👋</Text>
          <Text style={styles.subtitle}>Bienvenue sur votre dashboard de gestion des médicaments</Text>
        </View>

        {/* Section Patient */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Informations Patient</Text>
          <View style={styles.card}>
            <InfoRow label="Nom" value={patientInfo.name} />
            <InfoRow label="Âge" value={patientInfo.age} />
            <InfoRow label="Maladie" value={patientInfo.disease} />
            <View style={styles.infoRow}>
              <Text style={styles.label}>Statut</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>✅ {patientInfo.status}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Section Programme du jour */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏰ Programme du jour</Text>
          <View style={styles.card}>
            {schedule.map((item) => (
              <ScheduleItem key={item.id} item={item} />
            ))}
          </View>
        </View>

        {/* Boutons d'action */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={[styles.button, styles.primaryButton]}>
            <Text style={styles.buttonText}>➕ Ajouter un médicament</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]}>
            <Text style={styles.buttonText}>📋 Voir l'historique</Text>
          </TouchableOpacity>
        </View>

        {/* Section Stock des médicaments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📦 Stock des médicaments</Text>
          <View style={styles.card}>
            {medicationStock.map((item) => (
              <StockItem key={item.id} item={item} />
            ))}
          </View>
        </View>

        {/* Espace en bas */}
        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Composant pour une ligne d'information
function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

// Composant pour un élément du planning
function ScheduleItem({ item }) {
  return (
    <View style={styles.scheduleItem}>
      <Text style={styles.timeText}>{item.time}</Text>
      <View style={styles.medicationInfo}>
        <Text style={styles.medicationName}>{item.medication}</Text>
        <Text style={styles.dosageText}>{item.dosage}</Text>
      </View>
      <TouchableOpacity
        style={[
          styles.statusButton,
          item.taken ? styles.takenButton : styles.missedButton,
        ]}
      >
        <Text style={styles.statusButtonText}>
          {item.taken ? 'Pris' : 'Manqué'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Composant pour un élément du stock
function StockItem({ item }) {
  const getStatusColor = () => {
    if (item.status === 'warning') return '#e74c3c';
    if (item.status === 'good') return '#27ae60';
    return '#7f8c8d';
  };

  return (
    <View style={styles.stockItem}>
      <Text style={styles.stockName}>{item.name}</Text>
      <Text style={[styles.stockDays, { color: getStatusColor() }]}>
        {item.daysRemaining} jours restants
      </Text>
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    marginBottom: 30,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 15,
    paddingLeft: 5,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  label: {
    fontSize: 16,
    color: '#7f8c8d',
  },
  value: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
  },
  statusBadge: {
    backgroundColor: '#e8f6ef',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  statusText: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '500',
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  timeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    width: 80,
  },
  medicationInfo: {
    flex: 1,
    marginLeft: 15,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
    marginBottom: 2,
  },
  dosageText: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  statusButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  takenButton: {
    backgroundColor: '#27ae60',
  },
  missedButton: {
    backgroundColor: '#e74c3c',
  },
  statusButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
    gap: 15,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryButton: {
    backgroundColor: '#3498db',
  },
  secondaryButton: {
    backgroundColor: '#9b59b6',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  stockItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  stockName: {
    fontSize: 16,
    color: '#2c3e50',
    fontWeight: '500',
  },
  stockDays: {
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSpace: {
    height: 30,
  },
});