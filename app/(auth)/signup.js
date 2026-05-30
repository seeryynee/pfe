import { Ionicons } from "@expo/vector-icons";
import { useRouter } from 'expo-router';
import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from '../lib/supabase';

export default function SignUpScreen() {
  const router = useRouter();

  const [role, setRole]                   = useState("caregiver");
  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone]                 = useState("");
  const [patientName, setPatientName]     = useState("");
  const [caregiverEmail, setCaregiverEmail] = useState("");
  const [loading, setLoading]             = useState(false);

  const handleRoleSwitch = (newRole) => {
    setRole(newRole);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setPhone("");
    setPatientName("");
    setCaregiverEmail("");
  };

  const handleSignup = async () => {
    // ── Validation ──────────────────────────────────────────────────────────
    if (!email.trim() || !password || !confirmPassword || !phone) {
      Alert.alert("Error", "Please fill all required fields");
      return;
    }
    if (role === 'patient' && (!patientName.trim() || !caregiverEmail.trim())) {
      Alert.alert("Error", "Patient name and caregiver email are required.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    const cleanPhone = phone.trim();
    const phoneRegex = /^(05|06|07)\d{8}$/;
    if (!phoneRegex.test(cleanPhone)) {
      Alert.alert("Invalid Phone", "Please enter a 10-digit number starting with 05, 06, or 07.");
      return;
    }
    const formattedPhone = "+213" + cleanPhone.substring(1);

    setLoading(true);
    try {
      // ── 1. Create auth user ────────────────────────────────────────────────
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Signup failed — no user returned.");

      // ── 2. Create profile row via RPC ──────────────────────────────────────
      if (role === 'caregiver') {
        const { error: profileError } = await supabase.rpc('create_caregiver_profile', {
          p_user_id: authData.user.id,
          p_email:   email.trim().toLowerCase(), // ✅ needed so patients can find this caregiver
          p_phone:   formattedPhone,
        });
        if (profileError) throw profileError;

      } else {
        const { error: profileError } = await supabase.rpc('create_patient_profile', {
          p_user_id: authData.user.id,
          p_name:    patientName.trim(),
          p_phone:   formattedPhone,
          c_email:   caregiverEmail.trim().toLowerCase(),
        });
        if (profileError) throw profileError;
      }

      // ── 3. Handle email-confirmation requirement ───────────────────────────
      // authData.session is null when Supabase requires email confirmation.
      // In that case show a message and send to login — don't navigate into the app.
      if (!authData.session) {
        Alert.alert(
          "Check your email",
          "We sent a confirmation link to " + email.trim().toLowerCase() + ". Please confirm your email before logging in.",
          [{ text: "OK", onPress: () => router.replace('/(auth)/login') }]
        );
        return;
      }

      // Session exists → email confirmation is disabled, navigate straight in
      if (role === 'patient') {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/(tabs)/home');
      }

    } catch (err) {
      Alert.alert("Signup Failed", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView bounces={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.topSection}>
          <Image source={require("../../assets/images/adn.png")} style={styles.adn} />
        </View>

        <View style={styles.header}>
          <Text style={styles.hello}>Create Account</Text>
          <Text style={styles.welcome}>Join Remed today</Text>
        </View>

        <View style={styles.card}>
          {/* Role Toggle */}
          <View style={styles.roleContainer}>
            {["caregiver", "patient"].map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleButton, role === r && styles.roleActive]}
                onPress={() => handleRoleSwitch(r)}
              >
                <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                  {r === "caregiver" ? "Caregiver" : "Patient"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.title}>
            Sign Up as {role === "caregiver" ? "Caregiver" : "Patient"}
          </Text>

          {/* Patient name — only for patient role */}
          {role === "patient" && (
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#0b4f5c" />
              <TextInput
                placeholder="Patient Full Name"
                placeholderTextColor="#666"
                value={patientName}
                onChangeText={setPatientName}
                style={styles.input}
              />
            </View>
          )}

          {/* Email */}
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#0b4f5c" />
            <TextInput
              placeholder="Email"
              placeholderTextColor="#666"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
          </View>

          {/* Password */}
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#0b4f5c" />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#666"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
          </View>

          {/* Confirm Password */}
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#0b4f5c" />
            <TextInput
              placeholder="Confirm Password"
              placeholderTextColor="#666"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.input}
            />
          </View>

          {/* Phone */}
          <View style={styles.inputContainer}>
            <Ionicons name="call-outline" size={20} color="#0b4f5c" />
            <TextInput
              placeholder="Phone (05xxxxxxxx)"
              placeholderTextColor="#666"
              value={phone}
              onChangeText={setPhone}
              style={styles.input}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>

          {/* Caregiver email link — only for patient role */}
          {role === "patient" && (
            <View style={[styles.inputContainer, styles.caregiverLinkBox]}>
              <Ionicons name="link-outline" size={20} color="#0b4f5c" />
              <TextInput
                placeholder="Linked Caregiver Email"
                placeholderTextColor="#666"
                autoCapitalize="none"
                keyboardType="email-address"
                value={caregiverEmail}
                onChangeText={setCaregiverEmail}
                style={styles.input}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && { opacity: 0.7 }]}
            onPress={handleSignup}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Creating Account…" : "Sign Up"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.login}>
            Already have an account?{" "}
            <Text
              style={styles.loginLink}
              onPress={() => router.push("/(auth)/login")}
            >
              Login
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#0b4f5c" },
  topSection:  { height: 100 },
  adn:         { position: "absolute", top: 10, left: 10, width: 80, height: 80, resizeMode: "contain" },
  header:      { paddingHorizontal: 30, paddingBottom: 20 },
  hello:       { fontSize: 32, color: "white", fontWeight: "bold" },
  welcome:     { color: "white", fontSize: 16, marginTop: 5 },
  card: {
    flex: 1,
    backgroundColor: "#eaeaea",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 25,
    paddingTop: 30,
  },
  roleContainer: {
    flexDirection: "row",
    backgroundColor: "white",
    borderRadius: 30,
    marginBottom: 20,
    padding: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  roleButton:      { flex: 1, paddingVertical: 12, borderRadius: 30, alignItems: "center" },
  roleActive:      { backgroundColor: "#0b4f5c" },
  roleText:        { fontSize: 16, fontWeight: "bold", color: "#0b4f5c" },
  roleTextActive:  { color: "white" },
  title:           { fontSize: 22, fontWeight: "bold", marginBottom: 20, color: "#0b4f5c" },
  inputContainer: {
    backgroundColor: "white",
    borderRadius: 30,
    paddingHorizontal: 20,
    marginBottom: 15,
    height: 55,
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
  },
  caregiverLinkBox: { borderWidth: 1.5, borderColor: "#0b4f5c" },
  input:       { flex: 1, fontSize: 16, marginLeft: 10, color: "#333" },
  button:      { backgroundColor: "#0b4f5c", height: 55, borderRadius: 30, justifyContent: "center", alignItems: "center", marginTop: 10 },
  buttonText:  { color: "white", fontSize: 18, fontWeight: "bold" },
  login:       { textAlign: "center", color: "#555", fontSize: 15, marginTop: 15 },
  loginLink:   { color: "#0b4f5c", fontWeight: "bold", textDecorationLine: "underline" },
});