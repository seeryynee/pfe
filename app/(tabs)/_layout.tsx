import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from './../lib/supabase';

export default function TabLayout() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const getRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Step 1: check care_giver table
      const { data: caregiver } = await supabase
        .from('care_giver')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (caregiver) {
        setRole('caregiver');
        return;
      }

      // Step 2: check patients table
      // ✅ FIXED: patients.id = auth user id directly (user_id column removed)
      const { data: patient } = await supabase
        .from('patients')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (patient) {
        setRole('patient');
        return;
      }

      // Fallback
      setRole('caregiver');
    };

    getRole();
  }, []);

  if (role === null) return null;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0b4f5c',
        headerShown: false,
        tabBarInactiveTintColor: '#8e8e8e',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: 73,
          paddingBottom: 20,
          paddingTop: 8,
        },
      }}
    >
      {/* PATIENT only */}
      <Tabs.Screen
        name="confirmation"
        options={{
          title: 'Confirm',
          href: role === 'caregiver' ? null : undefined,
          tabBarIcon: ({ color }) => (
            <Ionicons name="checkmark-circle" size={30} color={color} />
          ),
        }}
      />

      {/* both  */}
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={30} color={color} />
          ),
        }}
      />

      {/* CAREGIVER only */}
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          href: role === 'patient' ? null : undefined,
          tabBarIcon: ({ color }) => (
            <Ionicons name="add-circle" size={30} color={color} />
          ),
        }}
      />

      {/* CAREGIVER only */}
      <Tabs.Screen
        name="notification"
        options={{
          title: 'Notification',
          href: role === 'patient' ? null : undefined,
          tabBarIcon: ({ color }) => (
            <Ionicons name="notifications" size={30} color={color} />
          ),
        }}
      />

      {/* EVERYONE */}
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => (
            <Ionicons name="time" size={30} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}