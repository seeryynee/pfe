
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { supabase } from '../lib/supabase';


export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const handleLogin = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        alert(error.message);
      } else {
        router.push('notification');
      }
    } catch (err) {
      alert(err.message);
    }
  };
 

  return (
    <View style={styles.container}>
         {/* Images en haut */}
      <View style={styles.topSection}>
    <Image
      source={require("../../assets/images/adn.png")}
      style={styles.adn}
    />
    <Image
      source={require("../../assets/images/Pill.png")}
      style={styles.Pill}
    />
  </View>

   
    
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.hello}>Hello!</Text>
        <Text style={styles.welcome}>Welcome to Remed</Text>

        
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.title}>Login</Text>

        {/* Email */}
        <View style={styles.inputContainer}>
          <Ionicons name="mail-outline" size={20} color="#0b4f5c" />
          <TextInput
            placeholder="Email"
            placeholderTextColor={"#555"}
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
             placeholderTextColor={"#555"}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />
        </View>

        

        {/* Login Button */}
         <TouchableOpacity 
         style={styles.button}
         onPress={handleLogin}
        >
        <Text style={styles.buttonText}>Login</Text>
         </TouchableOpacity>
        <Text style={styles.signup}>
        Don’t have account?{" "}
        <Text 
       style={styles.signupLink}
       onPress={() => router.push('signup')}
         >
       Sign Up
      </Text>
      </Text>
      </View>
    </View>
  );
  
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b4f5c",
  },

  header: {
    padding: 30,
  },

  hello: {
    fontSize: 52,
    color: "white",
    fontWeight: "bold",

  },

  welcome: {
    color: "white",
    fontSize: 18,
    marginTop: 5,
  },

 

  card: {
    flex: 1,
    backgroundColor: "#eaeaea",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 25,
  },

  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#0b4f5c",
  },

  inputContainer: {
    backgroundColor: "white",
    borderRadius: 30,
    paddingHorizontal: 20,
    marginBottom: 15,
    height: 50,
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center"
  },

  input: {
    flex: 1,
    fontSize: 16,
    marginLeft: 10,
    fontSize: 16,
    marginLeft: 10
  },
  button: {
    backgroundColor: "#0b4f5c",
    height: 50,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },

  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },

  signup: {
    textAlign: "center",
    color: "#555",
  },

  signupLink: {
    color: "#0b4f5c",
    fontWeight: "bold",
  },
  /* ===== Images top ===== */

  topSection: {
    height: 140,
    position: "relative",
  },

  adn: {
    position: "absolute",
    top: 0,
    left: 3,
    width: 100,
    height: 100,
    resizeMode: "contain",
  },

  Pill: {
    position: "absolute",
    right: 1,
    bottom: -20,
    width: 250,
    height:250,
    resizeMode: "contain",
    transform: [{ translateY: 180}], 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
  },
});