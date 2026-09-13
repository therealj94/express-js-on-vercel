#!/usr/bin/env python3
"""Compat: el despliegue de Pulse2Chat está en desplegar-pulse2chat.py."""
import runpy, pathlib
runpy.run_path(str(pathlib.Path(__file__).with_name('desplegar-pulse2chat.py')), run_name='__main__')
