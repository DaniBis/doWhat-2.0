import { router } from 'expo-router';
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, StatusBar, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  async function signInWithEmail() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        Alert.alert('Sign In Error', error.message);
      } else {
        router.back();
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function signUpWithEmail() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password
      });

      if (error) {
        Alert.alert('Sign Up Error', error.message);
      } else {
        Alert.alert(
          'Success', 
          'Check your email for the confirmation link!',
          [{ text: 'OK', onPress: () => setIsSignUp(false) }]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginRight: 16,
            padding: 8,
            marginLeft: -8
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={{
          fontSize: 18,
          fontWeight: '600',
          color: '#111827',
          flex: 1,
          textAlign: 'center',
          marginRight: 40
        }}>
          {isSignUp ? 'Sign Up' : 'Sign In'}
        </Text>
      </View>

      <View style={{ flex: 1, padding: 20 }}>
        <View style={{ marginTop: 40 }}>
          <View style={{
            alignItems: 'center',
            marginBottom: 40
          }}>
            <View style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: '#3B82F6',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16
            }}>
              <Ionicons name="person" size={40} color="#FFFFFF" />
            </View>
            <Text style={{
              fontSize: 24,
              fontWeight: '700',
              color: '#111827',
              marginBottom: 8
            }}>
              Welcome to doWhat
            </Text>
            <Text style={{
              fontSize: 16,
              color: '#6B7280',
              textAlign: 'center',
              lineHeight: 24
            }}>
              {isSignUp 
                ? 'Create an account to join activities and connect with others'
                : 'Sign in to your account to continue'
              }
            </Text>
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={{
              fontSize: 14,
              fontWeight: '500',
              color: '#374151',
              marginBottom: 8
            }}>
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              style={{
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 8,
                padding: 14,
                fontSize: 16,
                backgroundColor: '#FFFFFF'
              }}
            />
          </View>

          <View style={{ marginBottom: 30 }}>
            <Text style={{
              fontSize: 14,
              fontWeight: '500',
              color: '#374151',
              marginBottom: 8
            }}>
              Password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              style={{
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 8,
                padding: 14,
                fontSize: 16,
                backgroundColor: '#FFFFFF'
              }}
            />
          </View>

          <TouchableOpacity
            onPress={isSignUp ? signUpWithEmail : signInWithEmail}
            disabled={loading || !email || !password}
            style={{
              backgroundColor: (loading || !email || !password) ? '#9CA3AF' : '#3B82F6',
              borderRadius: 8,
              padding: 16,
              alignItems: 'center',
              marginBottom: 20
            }}
          >
            <Text style={{
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: '600'
            }}>
              {loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            </Text>
          </TouchableOpacity>

          <View style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <Text style={{
              color: '#6B7280',
              fontSize: 14
            }}>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}
            </Text>
            <TouchableOpacity
              onPress={() => setIsSignUp(!isSignUp)}
              style={{ marginLeft: 8 }}
            >
              <Text style={{
                color: '#3B82F6',
                fontSize: 14,
                fontWeight: '500'
              }}>
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
