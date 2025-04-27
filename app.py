from flask import Flask, render_template, request, jsonify
import numpy as np
import random
import json

app = Flask(__name__, static_folder='static', template_folder='templates')


class DegradationSimulator:
    def __init__(self, config):
        # Extract configuration parameters
        self.C = config.get('C', 3)  # Number of components
        self.simulation_steps = config.get('simulation_steps', 100)
        self.maintenance_cost = config.get('maintenance_cost', 1000)
        self.failure_cost = config.get('failure_cost', 5000)
        self.inspection_cost = config.get('inspection_cost', 100)

        # Component-specific parameters
        self.component_params = config.get('component_params', [])
        if not self.component_params:
            # Initialize with default values if not provided
            self.K = config.get('K', 7)  # Default failure threshold
            self.P = config.get('P', 0.15)  # Default degradation probability
            self._init_component_params()

        # Simulation results
        self.component_states = None
        self.sensor_signals = None
        self.system_health = {}
        self.intervention_count = 0
        self.failure_count = 0
        self.false_alarm_count = 0
        self.downtime_steps = 0
        self.maintenance_events = []

    def _init_component_params(self):
        """Initialize component parameters with default values"""
        self.component_params = []
        for i in range(self.C):
            self.component_params.append({
                'name': f"Component {i + 1}",
                'k': self.K,  # Failure threshold
                'p': self.P,  # Degradation probability
                'cost': 100.0  # Component-specific cost
            })

    def degrade_components(self, states, P=None):
        """ Degrade components based on a Bernoulli distribution with component-specific probabilities. """
        for i in range(len(states)):
            # Get component-specific failure threshold and degradation probability
            comp_k = self.component_params[i]['k']
            comp_p = self.component_params[i]['p'] if P is None else P

            if states[i] < comp_k:  # Use component-specific threshold
                if random.random() < comp_p:
                    states[i] += 1
        return states

    def observe_system(self, states):
        """ Aggregate sensor signal σ based on component-specific thresholds. """
        # Check if any component has failed based on its specific threshold
        if any(states[i] >= self.component_params[i]['k'] for i in range(len(states))):
            return 2  # Red: at least one component has failed
        elif any(state > 0 for state in states):
            return 1  # Yellow: at least one component is degraded, but none are failed
        else:
            return 0  # Green: all components are operational

    def perform_maintenance(self, states):
        """ Perform maintenance and reset all components to state 0. """
        states.fill(0)
        return states

    def calculate_costs(self, simulation_steps):
        """Calculate total costs based on maintenance events, failures, and inspections."""
        # Calculate component-specific costs
        component_replacement_costs = sum(comp['cost'] for comp in self.component_params) * self.intervention_count

        # Add maintenance labor cost
        maintenance_labor_cost = self.maintenance_cost * self.intervention_count

        # Total maintenance cost combines parts and labor
        maintenance_cost = component_replacement_costs + maintenance_labor_cost

        # Other costs
        failure_cost = self.failure_cost * self.failure_count
        inspection_cost = self.inspection_cost * simulation_steps  # Inspection done at every step

        return {
            'maintenance_cost': maintenance_cost,
            'component_replacement_cost': component_replacement_costs,
            'maintenance_labor_cost': maintenance_labor_cost,
            'failure_cost': failure_cost,
            'inspection_cost': inspection_cost,
            'total_cost': maintenance_cost + failure_cost + inspection_cost
        }

    def calculate_performance_metrics(self, simulation_steps):
        """Calculate performance metrics from the simulation."""
        # Uptime percentage (proportion of time not in failure state)
        uptime_percentage = ((simulation_steps - self.downtime_steps) / simulation_steps) * 100

        # Mean time between failures
        if self.failure_count > 0:
            mtbf = simulation_steps / self.failure_count
        else:
            mtbf = simulation_steps  # No failures occurred

        # Maintenance efficiency (cost per unit of uptime)
        total_cost = self.calculate_costs(simulation_steps)['total_cost']
        if uptime_percentage > 0:
            maintenance_efficiency = total_cost / uptime_percentage
        else:
            maintenance_efficiency = float('inf')  # Avoid division by zero

        # False alarm rate (interventions that weren't actually needed)
        if self.intervention_count > 0:
            false_alarm_rate = self.false_alarm_count / self.intervention_count * 100
        else:
            false_alarm_rate = 0

        return {
            'uptime_percentage': uptime_percentage,
            'mtbf': mtbf,
            'maintenance_efficiency': maintenance_efficiency,
            'false_alarm_rate': false_alarm_rate,
            'total_cost': total_cost
        }

    def run_simulation(self):
        """Run the degradation simulation"""
        # Initialize component states
        self.component_states = np.zeros((self.C, self.simulation_steps), dtype=int)
        current_states = np.zeros(self.C, dtype=int)
        self.sensor_signals = np.zeros(self.simulation_steps, dtype=int)

        # Reset system health, intervention count, and performance metrics
        self.system_health = {}
        self.intervention_count = 0
        self.failure_count = 0
        self.false_alarm_count = 0
        self.downtime_steps = 0
        self.maintenance_events = []

        # Initialize cost tracking
        maintenance_costs = np.zeros(self.simulation_steps)
        failure_costs = np.zeros(self.simulation_steps)
        inspection_costs = np.zeros(self.simulation_steps)
        cumulative_costs = np.zeros(self.simulation_steps)

        # Main simulation loop
        for t in range(self.simulation_steps):
            # Add inspection cost at every step
            inspection_costs[t] = self.inspection_cost

            # Degrade components using component-specific parameters
            current_states = self.degrade_components(current_states)
            self.component_states[:, t] = current_states.copy()

            # Observe the system health
            sensor_signal = self.observe_system(current_states)
            self.sensor_signals[t] = sensor_signal

            # Track system health
            self.system_health[t] = {
                'component_states': current_states.copy().tolist(),  # Convert to list for JSON serialization
                'sensor_signal': sensor_signal
            }

            # Check for failures (signal == 2)
            if sensor_signal == 2:
                self.failure_count += 1
                failure_costs[t] = self.failure_cost
                self.downtime_steps += 1

                # Maintenance decision (intervention when at least one component has failed)
                current_states = self.perform_maintenance(current_states)
                self.intervention_count += 1

                # Add component-specific costs for maintenance
                maintenance_costs[t] = self.maintenance_cost
                for comp in self.component_params:
                    maintenance_costs[t] += comp['cost']

                self.maintenance_events.append(t)

            # Calculate cumulative costs
            if t > 0:
                cumulative_costs[t] = cumulative_costs[t - 1] + maintenance_costs[t] + failure_costs[t] + \
                                      inspection_costs[t]
            else:
                cumulative_costs[t] = maintenance_costs[t] + failure_costs[t] + inspection_costs[t]

        # Calculate performance metrics and costs
        metrics = self.calculate_performance_metrics(self.simulation_steps)
        costs = self.calculate_costs(self.simulation_steps)

        # Prepare results
        results = {
            'component_states': self.component_states.tolist(),  # Convert NumPy arrays to lists for JSON
            'sensor_signals': self.sensor_signals.tolist(),
            'maintenance_events': self.maintenance_events,
            'intervention_count': self.intervention_count,
            'failure_count': self.failure_count,
            'performance_metrics': metrics,
            'costs': costs,
            'cost_data': {
                'maintenance_costs': maintenance_costs.tolist(),
                'failure_costs': failure_costs.tolist(),
                'inspection_costs': inspection_costs.tolist(),
                'cumulative_costs': cumulative_costs.tolist()
            }
        }

        return results


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/run_simulation', methods=['POST'])
def run_simulation():
    # Get configuration from request
    config = request.json
    
    # Create simulator with config
    simulator = DegradationSimulator(config)
    
    # Run simulation
    results = simulator.run_simulation()
    
    # Return results as JSON
    return jsonify(results)


@app.route('/api/component_params', methods=['POST'])
def update_component_params():
    # Update component parameters
    config = request.json
    return jsonify({"status": "success", "message": "Component parameters updated"})


if __name__ == '__main__':
    app.run(debug=True)