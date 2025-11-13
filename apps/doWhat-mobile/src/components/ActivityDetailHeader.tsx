import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { router } from 'expo-router';

type ActivityDetailHeaderProps = {
  name: string;
  locationName: string;
  date: string;
  time: string;
  imageUri?: string;
};

const ActivityDetailHeader: React.FC<ActivityDetailHeaderProps> = ({
  name,
  locationName,
  date,
  time,
  imageUri,
}) => {
  return (
    <View style={styles.container}>
      {/* Background Image with Gradient Overlay */}
      <View style={styles.imageContainer}>
        <Image
          source={
            imageUri
              ? { uri: imageUri }
              : require('../../assets/icon.png')
          }
          style={styles.backgroundImage}
        />
        <View style={styles.gradientOverlay} />
        
        {/* Back Button */}
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <AntDesign name="arrowleft" size={24} color="white" />
        </TouchableOpacity>
      </View>
      
      {/* Activity Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.name}>{name}</Text>
        <View style={styles.locationRow}>
          <AntDesign name="enviromento" size={16} color="#888" />
          <Text style={styles.locationText}>{locationName}</Text>
        </View>
        <View style={styles.timeRow}>
          <AntDesign name="calendar" size={16} color="#888" />
          <Text style={styles.timeText}>{date} • {time}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
  },
  imageContainer: {
    height: 200,
    position: 'relative',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    padding: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 14,
    color: '#555',
    marginLeft: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 14,
    color: '#555',
    marginLeft: 8,
  },
});

export default ActivityDetailHeader;
