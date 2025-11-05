FROM eclipse-mosquitto:2.0

# Copy configuration
COPY mosquitto.conf /mosquitto/config/mosquitto.conf

# Create data and log directories
RUN mkdir -p /mosquitto/data /mosquitto/log

# Set permissions
RUN chown -R mosquitto:mosquitto /mosquitto

# Expose MQTT ports
EXPOSE 1883 9001

CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]


