
from django.urls import path
from . import views

urlpatterns = [
    path("weather/", views.get_weather, name="get_weather"),
    path("suggestions/", views.search_locations, name="search_locations"),
]
