from datetime import datetime
def on_config(config, **kwargs):
    config.copyright = f"Copyright &copy; {datetime.now().year} Paul Grimshaw, Sara Pellegrini, Bastian Waidelich"