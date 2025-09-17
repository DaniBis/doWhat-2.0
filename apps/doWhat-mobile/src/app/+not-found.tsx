import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center', padding:24, backgroundColor:'#0f172a' }}>
      <Text style={{ fontSize:42, fontWeight:'800', color:'#f8fafc', marginBottom:12 }}>404</Text>
      <Text style={{ fontSize:18, color:'#cbd5e1', textAlign:'center', marginBottom:24 }}>Page not found.</Text>
      <Link href="/(tabs)/home" asChild>
        <Pressable style={{ backgroundColor:'#0ea5e9', paddingHorizontal:24, paddingVertical:12, borderRadius:12 }}>
          <Text style={{ color:'white', fontWeight:'700' }}>Go to Home</Text>
        </Pressable>
      </Link>
    </View>
  );
}
