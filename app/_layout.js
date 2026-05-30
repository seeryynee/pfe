import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ✅ Fonction pour créer les channels
async function registerNotificationChannels() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.log('Permission refusée');
    return;
  }
  
  if (Platform.OS === 'android') {
    // ✅ CHANNEL 1 : Pour les ALARMES de médicaments (medication time)
    await Notifications.setNotificationChannelAsync('medication-reminders-v3', {
      name: 'medication-reminders-v3',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1000, 500, 1000, 500, 1000], // ✅ Vibration longue
      lightColor: '#14B8A6',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
      bypassDnd: true,
    });
    console.log('✅ Android notification channels created');
  }
}

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // ✅ Crée les channels au démarrage
    registerNotificationChannels();

    // ✅ Écoute les clics sur les notifications
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('🔔 Notification cliquée !', response);

      const data = response.notification.request.content.data;

      // ✅ Redirige selon le type de notification
      if (data?.type === 'medication_reminder') {
        // Alarme de médicament → Va à la page Confirmation
        router.push('/(tabs)/confirmation');
      } else if (data?.type === 'medication_missed') {
        // Alert "Missed" → Va à la page Notification
        router.push('/(tabs)/notification');
      } else {
        // Par défaut → Page Notification
        router.push('/(tabs)/notification');
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}